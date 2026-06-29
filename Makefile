.PHONY: help check test run doctor providers models

help:
	@echo "Shimex commands"
	@echo "  make check      Run the current verification gate"
	@echo "  make test       Run Node tests"
	@echo "  make run        Start the local Shimex server"
	@echo "  make doctor     Check local Codex prerequisite and config"
	@echo "  make providers  List configured providers"
	@echo "  make models     List discovered Shimex models"

check:
	npm test
	npm run shimex -- doctor

test:
	npm test

run:
	npm run shimex -- server start

doctor:
	npm run shimex -- doctor

providers:
	npm run shimex -- providers list

models:
	npm run shimex -- models list
