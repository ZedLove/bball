# Makefile for bball project

build:
	docker build -t bball-dev .

run:
	docker run --env-file .env -p 4000:4000 bball-dev

dev:
	docker run --env-file .env -e DEV_MODE=true -it -p 4000:4000 bball-dev

shell:
	docker run --env-file .env -e DEV_MODE=true -it -p 4000:4000 --entrypoint /bin/sh bball-dev

compose-up:
	docker-compose up

compose-down:
	docker-compose down

.PHONY: build run dev shell compose-up compose-down
