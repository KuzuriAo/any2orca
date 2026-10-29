<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { Inspection, Shifts, SourceVendor } from 'any2orca';
  import { computePlateGridOffsets } from '../plateGrid';

  let {
    inspection,
    response
  }: {
    inspection: Inspection;
    response: { shifts?: Shifts } | null;
  } = $props();

  const VENDOR_NAMES: Record<SourceVendor, string> = {
    bambu: 'Bambu Lab',
    creality: 'Creality',
    anycubic: 'Anycubic',
    snapmaker: 'Snapmaker',
    elegoo: 'Elegoo',
    prusa: 'Prusa',
    flashforge: 'Flashforge',
    other: 'Source',
  };

  let selectedPlate = $state(1);

  let platesList = $derived.by(() => {
    if (inspection.plates && inspection.plates.length > 0) {
      return [...inspection.plates].sort((a, b) => a - b);
    }
    const plates = new Set<number>();
    (inspection.objects || []).forEach((obj) => {
      plates.add(obj.plate ?? 1);
    });
    return plates.size > 0 ? Array.from(plates).sort((a, b) => a - b) : [1];
  });

  let currentObjects = $derived.by(() => {
    return (inspection.objects || []).filter((obj) => (obj.plate ?? 1) === selectedPlate);
  });

  function parseSourceBedCorners(corners: string[] | null | undefined): { width: number; height: number } {
    if (!corners || !Array.isArray(corners)) {
      return { width: 256, height: 256 };
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (const corner of corners) {
      if (typeof corner === 'string') {
        const parts = corner.split('x');
        if (parts.length === 2) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          if (!isNaN(x) && !isNaN(y)) {
            xs.push(x);
            ys.push(y);
          }
        }
      }
    }
    if (xs.length < 2 || ys.length < 2) {
      return { width: 256, height: 256 };
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(50, Math.round(maxX - minX));
    const height = Math.max(50, Math.round(maxY - minY));
    return { width, height };
  }

  let sourceBed = $derived.by(() => {
    return parseSourceBedCorners(inspection.sourcePrintableArea);
  });

  let sourceVendor = $derived.by(() => {
    const id = inspection.sourceVendor ?? 'other';
    const name = (id === 'other' && inspection.printerModel)
      ? inspection.printerModel
      : (VENDOR_NAMES[id] || 'Source');
    return { id, name };
  });

  let activeBedWidth = $derived.by(() => {
    return response ? 270 : sourceBed.width;
  });

  let activeBedHeight = $derived.by(() => {
    return response ? 270 : sourceBed.height;
  });

  let watermarkScale = $derived.by(() => {
    return (Math.min(activeBedWidth, activeBedHeight) / 270) * 0.9;
  });

  /**
   * Bambu Studio (and Orca/Prusa-family slicers) arrange multiple plates in
   * one shared combined grid -- `cols = ceil(sqrt(plate count))`, row-major,
   * `pitch_x = bed_w * 1.2, pitch_y = -bed_h * 1.2` -- both in the SOURCE
   * file's own raw object coordinates and in the real OUTPUT file this tool
   * To render one plate in isolation on its own build sheet, both offsets need
   * subtracting back out:
   * - sourceOffset: pre-conversion preview undo using the absolute plate index
   *   and total slot count including empty plates (gaps).
   * - targetOffset: post-conversion U1 placement undo using the compacted index
   *   matching the engine's computeShifts.
   */
  let plateGrid = $derived.by(() => {
    return computePlateGridOffsets(platesList, selectedPlate, sourceBed, { width: 270, height: 270 });
  });
</script>

<div class="visualizer-container">
  <div class="visualizer-header">
    <div class="title-group">
      <h3 class="visualizer-title">Plate & Alignment Visualizer</h3>
      {#if response}
        <span class="badge badge-violet">Snapmaker U1 (270×270mm Bed)</span>
      {:else}
        <span class="badge badge-emerald">Source Bed ({activeBedWidth}×{activeBedHeight}mm)</span>
      {/if}
    </div>

    {#if platesList.length > 1}
      <div class="plate-tabs">
        {#each platesList as plateNum}
          <button
            class="tab-btn"
            class:active={selectedPlate === plateNum}
            onclick={() => (selectedPlate = plateNum)}
            type="button"
          >
            Plate {plateNum}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="svg-wrapper">
    <svg
      viewBox="-25 -20 {activeBedWidth + 50} {activeBedHeight + 45}"
      class="bed-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Grid Pattern -->
      <defs>
        <pattern id="grid" width="27" height="27" patternUnits="userSpaceOnUse">
          <path d="M 27 0 L 0 0 0 27" fill="none" stroke="var(--bed-grid-color)" stroke-width="1" />
        </pattern>
      </defs>

      <!-- Bed Base -->
      <rect
        x="0"
        y="0"
        width={activeBedWidth}
        height={activeBedHeight}
        rx="8"
        fill="var(--bed-surface-bg)"
        stroke="var(--bed-surface-border)"
        stroke-width="1.5"
      />
      <rect x="0" y="0" width={activeBedWidth} height={activeBedHeight} fill="url(#grid)" />

      <!-- Bed Watermark (Neutral text watermark for all vendors) -->
      <g
        transform="translate({activeBedWidth / 2}, {activeBedHeight / 2}) scale({watermarkScale})"
        opacity="var(--watermark-opacity, 0.24)"
        data-testid="bed-watermark"
      >
        <g fill="none" stroke="var(--watermark-color, currentColor)" stroke-width="1.5">
          <rect x="-12" y="-12" width="24" height="24" rx="4" />
          <circle cx="0" cy="0" r="4" fill="var(--watermark-color, currentColor)" />
        </g>
        {#if (response ? 'Snapmaker' : sourceVendor.name)}
          <text
            x="0"
            y="24"
            text-anchor="middle"
            font-family="var(--font-sans)"
            font-size="7.5"
            font-weight="600"
            letter-spacing="1"
            fill="var(--watermark-color, currentColor)"
            data-testid="bed-watermark-text"
          >
            {response ? 'Snapmaker' : sourceVendor.name}
          </text>
        {/if}
      </g>

      <!-- Center Crosshair -->
      <line
        x1={activeBedWidth / 2 - 10}
        y1={activeBedHeight / 2}
        x2={activeBedWidth / 2 + 10}
        y2={activeBedHeight / 2}
        stroke="var(--bed-crosshair-color)"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1={activeBedWidth / 2}
        y1={activeBedHeight / 2 - 10}
        x2={activeBedWidth / 2}
        y2={activeBedHeight / 2 + 10}
        stroke="var(--bed-crosshair-color)"
        stroke-width="1.5"
        stroke-linecap="round"
      />

      <!-- Objects Rendering -->
      {#each currentObjects as obj (obj.id)}
        {#if obj.bbox || obj.fallbackXy}
          {@const rawMinX = obj.bbox ? obj.bbox[0] : (obj.fallbackXy ? obj.fallbackXy[0] - 20 : activeBedWidth / 2 - 20)}
          {@const rawMaxX = obj.bbox ? obj.bbox[1] : (obj.fallbackXy ? obj.fallbackXy[0] + 20 : activeBedWidth / 2 + 20)}
          {@const rawMinY = obj.bbox ? obj.bbox[2] : (obj.fallbackXy ? obj.fallbackXy[1] - 20 : activeBedHeight / 2 - 20)}
          {@const rawMaxY = obj.bbox ? obj.bbox[3] : (obj.fallbackXy ? obj.fallbackXy[1] + 20 : activeBedHeight / 2 + 20)}
          {@const width = Math.max(2, rawMaxX - rawMinX)}
          {@const height = Math.max(2, rawMaxY - rawMinY)}
          {@const shift = response?.shifts?.[obj.id] || [0, 0]}

          <!-- Original Local Coordinates relative to the source plate. Bambu
               Studio (and Orca/Prusa-family slicers) store every plate past
               the first in one shared combined grid, not plate-local space
               -- confirmed directly against a real multi-plate export's raw
               <item> transforms (every object across 4 real plates matched
               its expected local position to the mm once this same offset
               was subtracted, no exceptions). Subtract unconditionally,
               same as the target side below -- a magnitude-based heuristic
               here would misfire on any real file whose object legitimately
               sits in the upper range of its own plate-local space. -->
          <!-- In 3D Slicer coordinates, Y=0 is FRONT (bottom of SVG), Y=activeBedHeight is BACK (top of SVG) -->
          {@const origLocalX = rawMinX - plateGrid.sourceOffset.x}
          {@const origLocalY = rawMinY - plateGrid.sourceOffset.y}
          {@const svgOrigX = origLocalX}
          {@const svgOrigY = sourceBed.height - (origLocalY + height)}

          <!-- Shifted / Final position on Target 270x270mm U1 Bed. `shift` is the
               real combined-grid shift from report.shifts; subtract this plate's target grid
               offset back out so each plate renders centered in its own local 270x270 view. -->
          {@const shiftedLocalX = rawMinX + shift[0] - plateGrid.targetOffset.x}
          {@const shiftedLocalY = rawMinY + shift[1] - plateGrid.targetOffset.y}
          {@const svgShiftedX = response ? shiftedLocalX : svgOrigX}
          {@const svgShiftedY = response ? (270 - (shiftedLocalY + height)) : svgOrigY}

          <!-- Original position outline (if converted & shifted relative to U1 bed) -->
          {@const isShifted = Math.abs(shiftedLocalX - origLocalX) > 0.1 || Math.abs(shiftedLocalY - origLocalY) > 0.1}
          {#if response && isShifted}
            {@const origOnU1X = origLocalX}
            {@const origOnU1Y = 270 - (origLocalY + height)}
            <rect
              x={origOnU1X}
              y={origOnU1Y}
              {width}
              {height}
              rx="3"
              fill="none"
              stroke="var(--danger)"
              stroke-width="1"
              stroke-dasharray="3,3"
            />
          {/if}

          {@const titleName = obj.isAssembly ? (obj.name && obj.name !== "Assembly" ? obj.name : "Assembly") : (obj.name || `Object #${obj.id}`)}
          {@const seqLabel = `Sequence #${obj.sequence ?? obj.id}`}
          {@const centerX = svgShiftedX + width / 2}
          {@const centerY = svgShiftedY + height / 2}
          {@const badgeW = Math.max(42, Math.min(Math.max(width - 2, 42), 65))}
          {@const badgeH = 22}

          <!-- Shifted / Final position -->
          <g class="object-group">
            <title>{titleName}, {seqLabel} ({Math.round(width)}×{Math.round(height)}mm)</title>
            <!-- Object Bounding Box -->
            <rect
              x={svgShiftedX}
              y={svgShiftedY}
              {width}
              {height}
              rx="4"
              fill="var(--bed-obj-fill)"
              stroke="var(--bed-obj-stroke)"
              stroke-width="1.5"
            />

            <!-- Bambu Studio Style Floating Info Badge -->
            <g class="object-badge">
              <rect
                class="object-badge-bg"
                x={centerX - badgeW / 2}
                y={centerY - badgeH / 2}
                width={badgeW}
                height={badgeH}
                rx="3"
                stroke-width="0.8"
              />
              <!-- Object Name Header -->
              <text
                class="object-badge-title"
                x={centerX}
                y={centerY - 3}
                text-anchor="middle"
                font-size="6.5"
                font-weight="700"
                font-family="var(--font-sans)"
              >
                {titleName.length > 11 ? titleName.slice(0, 9) + '…' : titleName}
              </text>
              <!-- Divider Line -->
              <line
                class="object-badge-divider"
                x1={centerX - badgeW / 2 + 4}
                y1={centerY + 0.5}
                x2={centerX + badgeW / 2 - 4}
                y2={centerY + 0.5}
                stroke-width="0.6"
              />
              <!-- Sequence Subtitle -->
              <text
                class="object-badge-sub"
                x={centerX}
                y={centerY + 7}
                text-anchor="middle"
                font-size="5.5"
                font-weight="500"
                font-family="var(--font-mono)"
              >
                {seqLabel}
              </text>
            </g>
          </g>
        {/if}
      {/each}

      <!-- Bed Orientation Guides (Top = Back, Bottom = Front) -->
      <text x={activeBedWidth / 2} y="-6" fill="var(--text-muted)" font-size="8" font-weight="600" text-anchor="middle" letter-spacing="1">▲ BACK ▲</text>
      <text x={activeBedWidth / 2} y={activeBedHeight + 16} fill="var(--text-muted)" font-size="8" font-weight="600" text-anchor="middle" letter-spacing="1">▼ FRONT ▼</text>
      <text x="-6" y={activeBedHeight / 2} fill="var(--text-muted)" font-size="8" font-weight="600" text-anchor="middle" transform="rotate(-90 -6 {activeBedHeight / 2})">LEFT</text>
      <text x={activeBedWidth + 6} y={activeBedHeight / 2} fill="var(--text-muted)" font-size="8" font-weight="600" text-anchor="middle" transform="rotate(90 {activeBedWidth + 6} {activeBedHeight / 2})">RIGHT</text>

      <!-- Origin & Dimensions Text -->
      <text x="2" y={activeBedHeight - 4} fill="var(--text-muted)" font-size="7.5" font-family="monospace">(0, 0)</text>
      <text x={activeBedWidth - 55} y={activeBedHeight - 4} fill="var(--text-muted)" font-size="7.5" font-family="monospace">{activeBedWidth}×{activeBedHeight}mm</text>
    </svg>
  </div>

  <div class="visualizer-legend">
    <div class="legend-item">
      <span class="legend-box current-box"></span>
      <span>{response ? 'Centered Placement on Snapmaker U1 Bed' : `${sourceVendor.name} Layout (${activeBedWidth}×${activeBedHeight}mm)`}</span>
    </div>
    {#if response}
      <div class="legend-item">
        <span class="legend-box original-box"></span>
        <span>Original {sourceVendor.name} Position</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .visualizer-container {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: none;
    width: 100%;
  }

  .object-badge-bg {
    fill: var(--bg-card);
    stroke: var(--bed-obj-stroke);
  }

  .object-badge-title {
    fill: var(--text-primary);
  }

  .object-badge-divider {
    stroke: var(--border-subtle);
  }

  .object-badge-sub {
    fill: var(--text-secondary);
  }

  .visualizer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .visualizer-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .badge-emerald {
    background: var(--success-glow);
    color: var(--success);
    border: 1px solid var(--success-glow);
  }

  .plate-tabs {
    display: flex;
    gap: 0.35rem;
    background: var(--bg-input);
    padding: 0.2rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }

  .tab-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.65rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover:not(.active) {
    color: var(--text-primary);
  }

  .tab-btn.active {
    background: var(--btn-primary-bg);
    color: var(--text-on-accent);
  }

  .svg-wrapper {
    width: 100%;
    max-width: 540px;
    margin: 0.5rem auto;
  }

  .bed-svg {
    width: 100%;
    height: auto;
    display: block;
  }

  .object-group rect {
    transition: all 0.3s ease;
  }

  .visualizer-legend {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .legend-box {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .current-box {
    background: var(--bed-obj-fill);
    border: 1px solid var(--bed-obj-stroke);
  }

  .original-box {
    border: 1px dashed var(--danger);
  }
</style>