// SPDX-License-Identifier: MIT
import type { ConvertObject } from "../schema.js";
import { parseBedCorners } from "./bedCenter.js";

export interface ComputeShiftsResult {
  shifts: Record<string, [number, number]>;
  warnings: string[];
}

type Bbox = [minX: number, maxX: number, minY: number, maxY: number];

// Below this, two AABBs count as "touching" for the shrink-to-fit pass's
// warning -- deliberately not zero: a small margin catches genuinely-tight
// arrangements without crying wolf over boxes that technically clear each
// other by a fraction of a mm (this checks *bounding boxes*, not the actual
// mesh, so some slack is honest about that imprecision).
const TOUCHING_TOLERANCE_MM = 2;

// Kept clear of the true bed edge on every side when fitting/shrinking a
// plate -- confirmed necessary directly: without this, an object could
// land exactly on the boundary (a mathematically valid fit), which still
// got flagged by Orca's own slicing check as sitting right on the edge.
// Orca's own check turned out to require >=3.5mm; padded up from there
// rather than shaving it exactly, so a small amount of slop (rounding,
// slightly different geometry) doesn't reopen the same complaint.
const EDGE_MARGIN_MM = 5;

/** True Euclidean gap between two axis-aligned boxes; 0 or negative means they touch or overlap. */
function aabbGap(a: Bbox, b: Bbox): number {
  const [aMinX, aMaxX, aMinY, aMaxY] = a;
  const [bMinX, bMaxX, bMinY, bMaxY] = b;
  const xGap = Math.max(bMinX - aMaxX, aMinX - bMaxX);
  const yGap = Math.max(bMinY - aMaxY, aMinY - bMaxY);
  if (xGap <= 0 && yGap <= 0) return Math.max(xGap, yGap); // overlapping on both axes
  if (xGap <= 0) return yGap; // overlap in X, separated in Y -- pure Y gap
  if (yGap <= 0) return xGap; // overlap in Y, separated in X -- pure X gap
  return Math.sqrt(xGap * xGap + yGap * yGap); // diagonal case
}

/**
 * The grid-layout, pitch and clearance-scaling step. Takes each object's
 * *already computed* world-space bounding box (from the request's
 * `objects[]`) instead of deriving it from mesh geometry, so the mesh is
 * read only once, when the file is opened.
 */
export function computeShifts(
  objects: readonly ConvertObject[],
  orcaPrintableArea: readonly string[],
  bambuClearanceRadius: number | null,
  orcaClearanceRadius: number | null,
): ComputeShiftsResult {
  const warnings: string[] = [];
  const objectById = new Map(objects.map((o) => [o.id, o]));

  // Group object ids by plate; objects with no plate metadata each become
  // their own singleton "unassigned" group.
  const plateGroups = new Map<number, string[]>();
  const unassignedIds: string[] = [];
  for (const obj of objects) {
    if (obj.plate !== undefined) {
      const arr = plateGroups.get(obj.plate) ?? [];
      arr.push(obj.id);
      plateGroups.set(obj.plate, arr);
    } else {
      unassignedIds.push(obj.id);
    }
  }
  const plateKeys = [...plateGroups.keys()].sort((a, b) => a - b);

  // Each plate's TRUE combined geometric bbox center, plus each individual
  // object's own bbox (needed by the clearance-scaling pass below).
  const objectBbox = new Map<string, Bbox>();
  const groupCenter = new Map<number | string, [number, number]>();

  const computeGroupCenter = (oids: readonly string[]): [number, number] => {
    let xsMin = Infinity;
    let xsMax = -Infinity;
    let ysMin = Infinity;
    let ysMax = -Infinity;
    let found = false;
    for (const oid of oids) {
      const bbox = objectById.get(oid)?.bbox;
      if (!bbox) continue;
      const [minX, maxX, minY, maxY] = bbox;
      objectBbox.set(oid, bbox);
      xsMin = Math.min(xsMin, minX);
      xsMax = Math.max(xsMax, maxX);
      ysMin = Math.min(ysMin, minY);
      ysMax = Math.max(ysMax, maxY);
      found = true;
    }
    if (found) {
      return [(xsMin + xsMax) / 2, (ysMin + ysMax) / 2];
    }
    const fallback = objectById.get(oids[0])?.fallbackXy;
    if (!fallback) {
      warnings.push(`  WARN: object ${oids[0]} has no bbox and no fallback_xy; treating its position as (0, 0).`);
      return [0, 0];
    }
    return fallback;
  };

  for (const key of plateKeys) {
    groupCenter.set(key, computeGroupCenter(plateGroups.get(key)!));
  }
  for (const oid of unassignedIds) {
    groupCenter.set(`__unassigned_${oid}`, computeGroupCenter([oid]));
  }

  // Bambu and Orca each arrange multiple plates in a roughly square grid
  // (columns = ceil(sqrt(plate count)), row-major), and each computes its
  // own pitch from its OWN bed size, not the source file's spacing (Orca's
  // own "Center" operation on the U1's 270mm bed uses 270*1.2 = 324mm
  // spacing, confirmed against real before/after coordinates).
  const cols = plateKeys.length > 0 ? Math.max(1, Math.ceil(Math.sqrt(plateKeys.length))) : 1;

  const orcaBed = parseBedCorners(orcaPrintableArea);
  const orcaBedW = orcaBed.maxX - orcaBed.minX;
  const orcaBedH = orcaBed.maxY - orcaBed.minY;
  const pitchX = orcaBedW * 1.2;
  const pitchY = -orcaBedH * 1.2;
  const [orcaCx, orcaCy] = [orcaBed.centerX, orcaBed.centerY];

  // The fit/shrink math below targets this slightly-smaller "usable" area
  // (inset by EDGE_MARGIN_MM on every side), not the raw bed -- pitch/grid
  // layout above is unaffected, this only matters for how close a single
  // plate's own objects are allowed to sit to the true edge.
  const usableBedW = Math.max(0, orcaBedW - 2 * EDGE_MARGIN_MM);
  const usableBedH = Math.max(0, orcaBedH - 2 * EDGE_MARGIN_MM);

  const shifts: Record<string, [number, number]> = {};
  const groupTarget = new Map<number | string, [number, number]>();

  const groupOids = new Map<number | string, readonly string[]>();

  const applyGroupShift = (key: number | string, oids: readonly string[], target: [number, number]) => {
    groupTarget.set(key, target);
    groupOids.set(key, oids);
    const [bboxCx, bboxCy] = groupCenter.get(key)!;
    const dx = target[0] - bboxCx;
    const dy = target[1] - bboxCy;
    const label = typeof key === "number" ? `plate ${key}` : `object ${oids[0]} (no plate metadata)`;
    warnings.push(
      `  ${label}: true geometric center (${bboxCx.toFixed(2)}, ${bboxCy.toFixed(2)}) -> ` +
        `target (${target[0].toFixed(2)}, ${target[1].toFixed(2)}), shift (${dx >= 0 ? "+" : ""}${dx.toFixed(2)}, ${dy >= 0 ? "+" : ""}${dy.toFixed(2)}) mm`,
    );
    for (const oid of oids) {
      shifts[oid] = [dx, dy];
    }
  };

  plateKeys.forEach((key, plateIdx) => {
    const col = plateIdx % cols;
    const row = Math.floor(plateIdx / cols);
    applyGroupShift(key, plateGroups.get(key)!, [orcaCx + col * pitchX, orcaCy + row * pitchY]);
  });
  for (const oid of unassignedIds) {
    applyGroupShift(`__unassigned_${oid}`, [oid], [orcaCx, orcaCy]);
  }

  // ---- Spacing-scale pass ----
  // Scales each multi-object plate's arrangement around its own true-
  // geometry centroid -- outward (grow) restores the same proportional
  // safety margin the layout had under Bambu's smaller clearance radius
  // (proportional scaling, rather than reimplementing Orca's exact collision
  // geometry); inward (shrink)
  // is the opposite move, used when the plate doesn't even fit the target
  // bed at its original spacing -- translation alone can't fix that
  // without silently rescaling the creator's own geometry, but pulling
  // objects closer together (never resizing them) can. Growing is capped
  // at whatever fits the bed; shrinking is only ever as tight as the bed
  // actually requires, and flagged if that leaves objects touching.
  const desiredRatio =
    bambuClearanceRadius && orcaClearanceRadius && orcaClearanceRadius > bambuClearanceRadius
      ? orcaClearanceRadius / bambuClearanceRadius
      : 1.0;

  const shrunkPlates = new Set<number>();
  for (const key of plateKeys) {
    const oids = (plateGroups.get(key) ?? []).filter((oid) => objectBbox.has(oid));
    if (oids.length < 2) continue; // nothing to space apart or compact on a single-object plate

    const centroid = groupCenter.get(key)!;
    // Windows each plate around its own grid target rather than the bed's
    // absolute bounds -- mathematically equivalent to using the absolute
    // bounds directly (both reduce to the same distance-to-half-bed-width
    // check, since the bed is always symmetric around its own center), but
    // explicit rather than relying on that coincidence, and reads
    // correctly at a glance for plates beyond the first. Sized to the
    // usable (margin-inset) area, not the raw bed -- see EDGE_MARGIN_MM.
    const [targetX, targetY] = groupTarget.get(key)!;
    const winMinX = targetX - usableBedW / 2;
    const winMaxX = targetX + usableBedW / 2;
    const winMinY = targetY - usableBedH / 2;
    const winMaxY = targetY + usableBedH / 2;
    let effectiveRatio = desiredRatio;

    for (const oid of oids) {
      const [minX, maxX, minY, maxY] = objectBbox.get(oid)!;
      const ocx = (minX + maxX) / 2;
      const ocy = (minY + maxY) / 2;
      const halfW = (maxX - minX) / 2;
      const halfH = (maxY - minY) / 2;
      const vx = ocx - centroid[0];
      const vy = ocy - centroid[1];
      for (const [v, half, base, lo, hi] of [
        [vx, halfW, targetX, winMinX, winMaxX],
        [vy, halfH, targetY, winMinY, winMaxY],
      ] as const) {
        if (v > 1e-9) {
          effectiveRatio = Math.min(effectiveRatio, (hi - half - base) / v);
        } else if (v < -1e-9) {
          effectiveRatio = Math.min(effectiveRatio, (lo + half - base) / v);
        }
      }
    }
    // No lower floor at 1.0 here (unlike the grow-only version this
    // replaced) -- that's precisely what lets this shrink below 1 when the
    // plate doesn't fit the bed even at its original spacing. Floored at 0
    // instead: a negative ratio would flip objects to the opposite side of
    // the centroid, which is never useful -- 0 is "collapse onto the
    // centroid point," the tightest this pass can ever get.
    effectiveRatio = Math.max(0, effectiveRatio);

    // Pulling objects together never makes two of them overlap that didn't before: Snapmaker Orca refuses to
    // slice such a plate. The gap between two boxes only grows with the ratio, so the tightest ratio that keeps
    // every such pair apart is found by bisection; a plate still too big then gets the footprint warning below.
    if (effectiveRatio < 1) {
      const scaledBox = (oid: string, r: number): Bbox => {
        const [minX, maxX, minY, maxY] = objectBbox.get(oid)!;
        const dx = (r - 1) * ((minX + maxX) / 2 - centroid[0]);
        const dy = (r - 1) * ((minY + maxY) / 2 - centroid[1]);
        return [minX + dx, maxX + dx, minY + dy, maxY + dy];
      };
      const apartAtStart: [string, string][] = [];
      for (let i = 0; i < oids.length; i++) {
        for (let j = i + 1; j < oids.length; j++) {
          if (aabbGap(objectBbox.get(oids[i])!, objectBbox.get(oids[j])!) > 0) apartAtStart.push([oids[i], oids[j]]);
        }
      }
      const keepsApart = (r: number) => apartAtStart.every(([a, b]) => aabbGap(scaledBox(a, r), scaledBox(b, r)) > 0);
      if (!keepsApart(effectiveRatio)) {
        let lo = effectiveRatio;
        let hi = 1;
        for (let step = 0; step < 40; step++) {
          const mid = (lo + hi) / 2;
          if (keepsApart(mid)) hi = mid;
          else lo = mid;
        }
        effectiveRatio = hi;
      }
    }

    if (Math.abs(effectiveRatio - 1) > 1e-4) {
      for (const oid of oids) {
        const [minX, maxX, minY, maxY] = objectBbox.get(oid)!;
        const ocx = (minX + maxX) / 2;
        const ocy = (minY + maxY) / 2;
        const extraDx = (effectiveRatio - 1) * (ocx - centroid[0]);
        const extraDy = (effectiveRatio - 1) * (ocy - centroid[1]);
        const [oldDx, oldDy] = shifts[oid];
        shifts[oid] = [oldDx + extraDx, oldDy + extraDy];
      }

      if (effectiveRatio > 1) {
        const wasClamped = effectiveRatio < desiredRatio - 1e-6;
        warnings.push(
          `  plate ${key}: spacing scaled ${effectiveRatio.toFixed(4)}x around its centroid ` +
            `(clearance radius ${bambuClearanceRadius}mm -> ${orcaClearanceRadius}mm)${wasClamped ? "; clamped, see below" : ""}`,
        );
        // Routine (unclamped) scaling is informational only -- not worth
        // surfacing to the end user. Being clamped means the ideal scale
        // didn't fit and objects may now sit closer together than the
        // U1's own clearance radius calls for; that genuinely needs a
        // human's attention, so it gets its own "WARN:"-prefixed entry
        // (the marker callers filter user-facing warnings on, matching
        // every other actionable warning in this pipeline).
        if (wasClamped) {
          warnings.push(
            `  WARN: plate ${key}'s spacing was clamped to ${effectiveRatio.toFixed(4)}x (ideally ${desiredRatio.toFixed(4)}x) ` +
              `to keep every object on the bed, so objects on this plate may be closer together than the Snapmaker U1's ` +
              `clearance radius calls for. Review spacing on this plate manually before printing.`,
          );
        }
      } else {
        shrunkPlates.add(key);
        warnings.push(
          `  plate ${key}: spacing tightened to ${effectiveRatio.toFixed(4)}x around its centroid to fit the ` +
            `target bed (${orcaBedW.toFixed(1)} x ${orcaBedH.toFixed(1)} mm, keeping a ${EDGE_MARGIN_MM}mm margin from the edge); ` +
            `see below for whether that leaves objects touching.`,
        );
        // Shrinking never fails to fit the bed by construction (it's
        // solved for exactly that), but pulling objects closer together
        // can leave them touching or overlapping -- that's the thing
        // worth a human's attention here, checked below using final
        // (post-shift) positions across every group, not just this one.
      }
    }
  }

  // ---- Final bed-fit check ----
  // Runs after any grow/shrink above, using each object's FINAL (fully
  // shifted) position -- not the pre-scale footprint -- since shrinking
  // can resolve an overflow that would otherwise still be there. Confirmed
  // real-world trigger: converting from a printer with a larger bed than
  // the target (e.g. Bambu H2C's 330x320mm vs the U1's 270x270mm) with a
  // plate whose spacing can't be tightened enough to fit (rare -- most
  // real layouts have some slack -- but possible if objects are already
  // packed edge-to-edge).
  for (const [key, oids] of groupOids) {
    let xsMin = Infinity;
    let xsMax = -Infinity;
    let ysMin = Infinity;
    let ysMax = -Infinity;
    let found = false;
    for (const oid of oids) {
      const bbox = objectBbox.get(oid);
      if (!bbox) continue;
      const [dx, dy] = shifts[oid];
      xsMin = Math.min(xsMin, bbox[0] + dx);
      xsMax = Math.max(xsMax, bbox[1] + dx);
      ysMin = Math.min(ysMin, bbox[2] + dy);
      ysMax = Math.max(ysMax, bbox[3] + dy);
      found = true;
    }
    if (!found) continue; // fallback_xy-only group -- a point, nothing to check

    const footprintW = xsMax - xsMin;
    const footprintH = ysMax - ysMin;
    const overW = footprintW - usableBedW;
    const overH = footprintH - usableBedH;
    if (overW > 1e-6 || overH > 1e-6) {
      const label = typeof key === "number" ? `plate ${key}` : `object ${oids[0]} (no plate metadata)`;
      warnings.push(
        `  WARN: ${label}'s combined footprint (${footprintW.toFixed(1)} x ${footprintH.toFixed(1)} mm) is larger ` +
          `than the usable printable area (${usableBedW.toFixed(1)} x ${usableBedH.toFixed(1)} mm, keeping a ${EDGE_MARGIN_MM}mm ` +
          `margin from the ${orcaBedW.toFixed(1)} x ${orcaBedH.toFixed(1)} mm bed's edge)${overW > 1e-6 ? ` by ${overW.toFixed(1)}mm in X` : ""}${overW > 1e-6 && overH > 1e-6 ? " and" : ""}${overH > 1e-6 ? ` by ${overH.toFixed(1)}mm in Y` : ""} -- ` +
          `some objects will be positioned outside the printable area even when centered. Split this plate or rearrange/scale down the objects before converting.`,
      );
    }
  }

  // ---- Touching check (only for plates that were actively shrunk) ----
  for (const key of plateKeys) {
    if (!shrunkPlates.has(key)) continue;
    const oids = (plateGroups.get(key) ?? []).filter((oid) => objectBbox.has(oid));
    if (oids.length < 2) continue;

    let closestGap = Infinity;
    let closestPair: [string, string] | null = null;
    for (let i = 0; i < oids.length; i++) {
      for (let j = i + 1; j < oids.length; j++) {
        const [oidA, oidB] = [oids[i], oids[j]];
        const [dxA, dyA] = shifts[oidA];
        const [dxB, dyB] = shifts[oidB];
        const bboxA = objectBbox.get(oidA)!;
        const bboxB = objectBbox.get(oidB)!;
        const finalA: Bbox = [bboxA[0] + dxA, bboxA[1] + dxA, bboxA[2] + dyA, bboxA[3] + dyA];
        const finalB: Bbox = [bboxB[0] + dxB, bboxB[1] + dxB, bboxB[2] + dyB, bboxB[3] + dyB];
        const gap = aabbGap(finalA, finalB);
        if (gap < closestGap) {
          closestGap = gap;
          closestPair = [oidA, oidB];
        }
      }
    }
    if (closestPair && closestGap < TOUCHING_TOLERANCE_MM) {
      const gapDescription = closestGap <= 0 ? "are touching or overlapping" : `are only ${closestGap.toFixed(1)}mm apart`;
      warnings.push(
        `  WARN: plate ${key}'s objects were pulled together to fit the target bed, and object ${closestPair[0]} and ` +
          `object ${closestPair[1]} ${gapDescription} as a result (tolerance ${TOUCHING_TOLERANCE_MM}mm). ` +
          `Review spacing on this plate before printing.`,
      );
    }
  }

  return { shifts, warnings };
}
