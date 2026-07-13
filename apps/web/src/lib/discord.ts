interface AuthorizeResult {
  code: string;
}

interface AuthorizeCommand {
  authorize(args: {
    client_id: string;
    response_type: "code";
    state: string;
    prompt: "none";
    scope: string[];
  }): Promise<AuthorizeResult>;
}

interface ActivityConfig {
  discordClientId: string;
  mockAuth: boolean;
}

export async function getDiscordAuthorizationCode(): Promise<string> {
  const config = await getActivityConfig();
  const clientId = config.discordClientId || import.meta.env.VITE_DISCORD_CLIENT_ID;
  const useMock = config.mockAuth || import.meta.env.VITE_IRIS_MOCK_AUTH === "true";

  if (useMock) {
    return "mock-discord-authorization-code";
  }

  if (!clientId) {
    throw new Error("Discord Activity client ID is not configured.");
  }

  const { DiscordSDK } = await import("@discord/embedded-app-sdk");
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  const commands = sdk.commands as unknown as AuthorizeCommand;
  const result = await commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: crypto.randomUUID(),
    prompt: "none",
    scope: ["identify"]
  });

  return result.code;
}

async function getActivityConfig(): Promise<ActivityConfig> {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Activity configuration is unavailable.");

  const payload: unknown = await response.json().catch(() => null);
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).discordClientId !== "string" ||
    typeof (payload as Record<string, unknown>).mockAuth !== "boolean"
  ) {
    throw new Error("Activity configuration is invalid.");
  }

  return payload as ActivityConfig;
}
