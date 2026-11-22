# SPDX-License-Identifier: MIT
# The any2orca web app in a container: built from this repository, then served by nginx with the config next to
# this file (nginx/any2orca.conf: the security headers, the caching and the real 404 the other configs here have).
#
# Build it from the repository root, which is what the build needs to see:
#
#   docker build -f examples/self-hosting/Dockerfile -t any2orca-web .
#   docker run --rm -p 8080:80 any2orca-web          # then open http://localhost:8080
#
# For a public copy, give the build your site's address; without it the copy tells search engines to skip it
# (docs/run-the-web-app.md has this and the other settings):
#
#   docker build -f examples/self-hosting/Dockerfile --build-arg VITE_SITE_URL=https://convert.example.com -t any2orca-web .
#
# The container serves plain HTTP on port 80. Put it behind whatever ends TLS for your other sites, and once it is
# served over HTTPS, uncomment the Strict-Transport-Security line in nginx/any2orca.conf and build again.

# --- Build the web app -------------------------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /src
COPY . .
# Installs exactly what the lock file names, and builds the library the web app is made of.
RUN npm ci --no-audit --no-fund
# Set only when given, so a build without it is the private copy.
ARG VITE_SITE_URL
RUN npm run build -w @any2orca/web

# --- Serve it ------------------------------------------------------------------------------------------------------
FROM nginx:stable-alpine
# The image's own default site would answer first; this one replaces it.
COPY examples/self-hosting/nginx/any2orca.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist/ /var/www/any2orca/
EXPOSE 80
