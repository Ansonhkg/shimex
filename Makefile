.PHONY: help check test run backend backend-dev backend-restart backend-stop doctor providers models

help:
	@echo "Shimex commands"
	@echo "  make check      Run the current verification gate"
	@echo "  make test       Run Node tests"
	@echo "  make run        Start the local Shimex server in the foreground"
	@echo "  make backend    Start/reuse the detached backend only"
	@echo "  make backend-restart Restart only the detached backend"
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

backend:
	npm run shimex -- server ensure

backend-dev:
	npm run shimex -- server start

backend-restart:
	npm run shimex -- server restart

backend-stop:
	npm run shimex -- server stop

doctor:
	npm run shimex -- doctor

providers:
	npm run shimex -- providers list

models:
	npm run shimex -- models list
