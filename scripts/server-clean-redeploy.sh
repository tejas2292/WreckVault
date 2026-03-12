#!/bin/bash
# Run this ON THE SERVER (after SSH in) to: stop WreckVault containers, remove project, clone fresh, start.
set -e
echo "Stopping and removing WreckVault Docker containers..."
cd ~/WreckVault 2>/dev/null && docker compose down -v --remove-orphans || true
echo "Removing old project directory..."
cd ~
rm -rf WreckVault
echo "Cloning fresh from GitHub..."
git clone https://github.com/tejas2292/WreckVault.git
cd WreckVault
echo "Starting with Docker Compose..."
docker compose up -d --build
echo "Done. Containers:"
docker compose ps
