--[[
	CreateRemotes - Run once (e.g. from a server init) to create all RemoteEvents/Functions under ReplicatedStorage.
	Place this as a ModuleScript and call from ServerScriptService.InitServer.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Remotes = require(script.Parent:WaitForChild("Remotes"))

local CreateRemotes = {}

function CreateRemotes.Run()
	local folder = ReplicatedStorage:FindFirstChild("RemotesFolder")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "RemotesFolder"
		folder.Parent = ReplicatedStorage
	end

	local function getOrCreate(name, className)
		local existing = folder:FindFirstChild(name)
		if existing then return existing end
		local inst = Instance.new(className)
		inst.Name = name
		inst.Parent = folder
		return inst
	end

	-- Events (no return value)
	for key, name in pairs(Remotes) do
		if key == "RequestPurchaseStoreItem" or key == "RequestPlaceTower" or key == "RequestUpgradeTower" or key == "LobbyRequestStart" then
			getOrCreate(name, "RemoteEvent")
		else
			getOrCreate(name, "RemoteEvent")
		end
	end

	return folder
end

return CreateRemotes
