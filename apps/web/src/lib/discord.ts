import { DiscordSDK } from "@discord/embedded-app-sdk";

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

export async function getDiscordAuthorizationCode(): Promise<string> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const useMock = import.meta.env.VITE_IRIS_MOCK_AUTH === "true" || !clientId;

  if (useMock) {
    return "mock-discord-authorization-code";
  }

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
