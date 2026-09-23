.PHONY: dashboard detect live

# Default video paths (can be overridden, e.g., make detect VIDEO=data/input/my_video.mp4)
VIDEO ?= data/input/mv001.mp4
OUTPUT ?= data/exports/output.mp4
CAM ?= 0

# 1. Launches the React dashboard (and its API server)
dashboard:
	@echo "Starting RAVEN API Server and Dashboard..."
	(PYTHONPATH=. venv/bin/python -m uvicorn src.raven.api.server:app --port 8000 &) && cd dashboard && npm run dev

# 2. Runs detection on a given video
detect:
	@echo "Running RAVEN on video: $(VIDEO)"
	PYTHONPATH=. venv/bin/python -m src.raven.main --input $(VIDEO) --output $(OUTPUT)

# 3. Runs detection on live camera feed
live:
	@echo "Starting live feed..."
	PYTHONPATH=. venv/bin/python -m src.raven.main --camera $(CAM)
