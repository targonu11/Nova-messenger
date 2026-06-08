--[[
	Remotes - Central list of RemoteEvent/RemoteFunction names.
	Create these under ReplicatedStorage in Studio, or use Init script to create them.
]]

local Remotes = {}

Remotes.LobbyRequestStart = "LobbyRequestStart"
Remotes.LobbyStartCountdown = "LobbyStartCountdown"
Remotes.LobbyRoundStarted = "LobbyRoundStarted"
Remotes.LobbyUpdatePlayers = "LobbyUpdatePlayers"

Remotes.RequestPlaceTower = "RequestPlaceTower"
Remotes.RequestUpgradeTower = "RequestUpgradeTower"
Remotes.TowerPlaced = "TowerPlaced"
Remotes.TowerUpgraded = "TowerUpgraded"
Remotes.TowerFailed = "TowerFailed"

Remotes.RoundCurrencyChanged = "RoundCurrencyChanged"
Remotes.StreamcoinsChanged = "StreamcoinsChanged"
Remotes.RoundEnded = "RoundEnded"
Remotes.WaveStarted = "WaveStarted"
Remotes.WaveEnded = "WaveEnded"
Remotes.WavePreview = "WavePreview"

Remotes.RequestPurchaseStoreItem = "RequestPurchaseStoreItem"
Remotes.StorePurchaseResult = "StorePurchaseResult"
Remotes.OpenStore = "OpenStore"

Remotes.GameStateUpdate = "GameStateUpdate"

return Remotes
