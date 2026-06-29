.PHONY: help check test run doctor providers models

help:
	@echo "Shimex commands"
	@echo "  make check      Run the current verification gate"
	@echo "  make test       Run Bun tests"
	@echo "  make run        Start the local Shimex server"
	@echo "  make doctor     Check local Codex prerequisite and config"
	@echo "  make providers  List configured providers"
	@echo "  make models     List discovered Shimex models"

check:
	bun test
	bun run shimex doctor

test:
	bun test

run:
	bun run shimex server start

doctor:
	bun run shimex doctor

providers:
	bun run shimex providers list

models:
	bun run shimex models list

