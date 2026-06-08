--[[
	GameConfig - Round economy, wave rewards, and global balance constants.
	Round currency resets at the start of each round.
]]

local GameConfig = {}

-- Round currency (resets each round)
GameConfig.StartingRoundCurrency = 200
GameConfig.CurrencyPerWave = 40   -- base reward per wave completed
GameConfig.CurrencyPerWaveScaling = 5  -- extra per wave number (wave 2 = +10, wave 3 = +15, etc.)

-- Streamcoins (persistent, earned from playing / store)
GameConfig.StreamcoinsPerWave = 2
GameConfig.StreamcoinsBonusOnRoundWin = 25
GameConfig.StreamcoinsBonusOnRoundLose = 5

-- Waves
GameConfig.MaxWaves = 15
GameConfig.SecondsBetweenWaves = 12
GameConfig.EnemyBaseHealth = 60
GameConfig.EnemyHealthScalingPerWave = 1.18  -- each wave enemies have this much more HP
GameConfig.EnemySpeed = 10
GameConfig.EnemyCurrencyValue = 3  -- round currency per kill

-- Base / core (if you use a "base health" mechanic)
GameConfig.BaseMaxHealth = 100
GameConfig.BaseHealthPerWave = 0  -- optional: start with more HP on later rounds

-- Tower limits per round (can be increased by store)
GameConfig.DefaultMaxTowers = 12
GameConfig.TowerMaxLevel = 5

-- Lobby
GameConfig.MinPlayersToStart = 1
GameConfig.MaxPlayers = 8
GameConfig.LobbyCountdownSeconds = 10

return GameConfig
