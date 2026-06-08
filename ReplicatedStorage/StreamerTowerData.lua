--[[
	StreamerTowerData - All Russian Twitch streamer tower stats, abilities, and upgrade tables.
	Balance: 5 levels per tower, varied prices and strengths. Some attack, some support (health boost).
]]

local StreamerTowerData = {}

-- Tower types: ATTACK or SUPPORT
StreamerTowerData.TowerType = {
	ATTACK = "Attack",
	SUPPORT = "Support",
}

-- All streamer tower definitions. Names are fictional streamer personas.
-- Upgrade costs are in ROUND currency (resets each round). Level 1 = base (no upgrade cost).
StreamerTowerData.Streamers = {
	["Дед_Стример"] = {  -- Grandpa Streamer - slow, heavy hitter
		DisplayName = "Дед Стример",
		Description = "Медленный, но бьёт по-серьёзному.",
		Type = StreamerTowerData.TowerType.ATTACK,
		BasePrice = 120,  -- round currency to place
		Range = 24,
		AttackCooldown = 2.0,
		PlacementModel = "DedStreamer",
		Upgrades = {
			[1] = { Cost = 0,    Damage = 35,  Description = "Уровень 1" },
			[2] = { Cost = 80,   Damage = 52,  Description = "Уровень 2" },
			[3] = { Cost = 160,  Damage = 78,  Description = "Уровень 3" },
			[4] = { Cost = 280,  Damage = 115, Description = "Уровень 4" },
			[5] = { Cost = 450,  Damage = 165, Description = "Уровень 5" },
		},
	},
	["Медведь_Игрок"] = {  -- Bear Gamer - medium range, AoE feel (splash)
		DisplayName = "Медведь Игрок",
		Description = "Средняя дальность, урон по площади.",
		Type = StreamerTowerData.TowerType.ATTACK,
		BasePrice = 150,
		Range = 28,
		AttackCooldown = 1.4,
		SplashRadius = 8,
		PlacementModel = "MedvedStreamer",
		Upgrades = {
			[1] = { Cost = 0,    Damage = 22,  Description = "Уровень 1" },
			[2] = { Cost = 100,  Damage = 34,  Description = "Уровень 2" },
			[3] = { Cost = 200,  Damage = 50,  Description = "Уровень 3" },
			[4] = { Cost = 350,  Damage = 72,  Description = "Уровень 4" },
			[5] = { Cost = 550,  Damage = 105, Description = "Уровень 5" },
		},
	},
	["Снайпер_Читер"] = {  -- Sniper Cheater - long range, single target
		DisplayName = "Снайпер Читер",
		Description = "Дальняя атака по одной цели.",
		Type = StreamerTowerData.TowerType.ATTACK,
		BasePrice = 180,
		Range = 48,
		AttackCooldown = 1.8,
		PlacementModel = "SniperStreamer",
		Upgrades = {
			[1] = { Cost = 0,    Damage = 55,  Description = "Уровень 1" },
			[2] = { Cost = 120,  Damage = 82,  Description = "Уровень 2" },
			[3] = { Cost = 240,  Damage = 120, Description = "Уровень 3" },
			[4] = { Cost = 400,  Damage = 175, Description = "Уровень 4" },
			[5] = { Cost = 600,  Damage = 250, Description = "Уровень 5" },
		},
	},
	["Доктор_Чилл"] = {  -- Doctor Chill - heals/boosts health of nearby towers or base
		DisplayName = "Доктор Чилл",
		Description = "Восстанавливает здоровье союзных башен в радиусе.",
		Type = StreamerTowerData.TowerType.SUPPORT,
		BasePrice = 100,
		Range = 20,
		HealPerTick = 8,
		HealCooldown = 1.0,
		PlacementModel = "DoktorStreamer",
		Upgrades = {
			[1] = { Cost = 0,    HealPerTick = 8,   Description = "Уровень 1" },
			[2] = { Cost = 70,   HealPerTick = 14,  Description = "Уровень 2" },
			[3] = { Cost = 140,  HealPerTick = 22,  Description = "Уровень 3" },
			[4] = { Cost = 250,  HealPerTick = 34,  Description = "Уровень 4" },
			[5] = { Cost = 400,  HealPerTick = 50,  Description = "Уровень 5" },
		},
	},
	["Бард_Напиток"] = {  -- Bard Drink - buffs max health / damage of nearby towers
		DisplayName = "Бард Напиток",
		Description = "Увеличивает макс. здоровье башен в радиусе.",
		Type = StreamerTowerData.TowerType.SUPPORT,
		BasePrice = 130,
		Range = 22,
		HealthBoostPercent = 0.15,  -- 15% more max HP for towers in range
		PlacementModel = "BardStreamer",
		Upgrades = {
			[1] = { Cost = 0,    HealthBoostPercent = 0.15, Description = "Уровень 1" },
			[2] = { Cost = 90,   HealthBoostPercent = 0.22, Description = "Уровень 2" },
			[3] = { Cost = 180,  HealthBoostPercent = 0.30, Description = "Уровень 3" },
			[4] = { Cost = 300,  HealthBoostPercent = 0.40, Description = "Уровень 4" },
			[5] = { Cost = 480,  HealthBoostPercent = 0.55, Description = "Уровень 5" },
		},
	},
}

-- Streamcoins store: items purchasable with persistent streamcoins (cosmetics, starting bonus, etc.)
StreamerTowerData.StoreItems = {
	["StartGold_50"] = {
		DisplayName = "Стартовый бонус +50",
		Description = "В начале каждого раунда получаешь +50 к валюте раунда.",
		StreamcoinCost = 250,
		Type = "StartBonus",
		Value = 50,
	},
	["StartGold_100"] = {
		DisplayName = "Стартовый бонус +100",
		Description = "В начале каждого раунда получаешь +100 к валюте раунда.",
		StreamcoinCost = 450,
		Type = "StartBonus",
		Value = 100,
	},
	["ExtraTowerSlot"] = {
		DisplayName = "Доп. слот башни",
		Description = "Можно поставить на 1 башню больше за раунд.",
		StreamcoinCost = 600,
		Type = "TowerSlot",
		Value = 1,
	},
	["WavePreview"] = {
		DisplayName = "Предпросмотр волн",
		Description = "Видишь состав следующих 3 волн.",
		StreamcoinCost = 350,
		Type = "WavePreview",
		Value = true,
	},
}

function StreamerTowerData.GetStreamer(streamerId)
	return StreamerTowerData.Streamers[streamerId]
end

function StreamerTowerData.GetAllStreamerIds()
	local ids = {}
	for id in pairs(StreamerTowerData.Streamers) do
		table.insert(ids, id)
	end
	return ids
end

function StreamerTowerData.GetUpgradeData(streamerId, level)
	local streamer = StreamerTowerData.Streamers[streamerId]
	if not streamer or not streamer.Upgrades[level] then return nil end
	return streamer.Upgrades[level]
end

function StreamerTowerData.GetStoreItem(itemId)
	return StreamerTowerData.StoreItems[itemId]
end

return StreamerTowerData
