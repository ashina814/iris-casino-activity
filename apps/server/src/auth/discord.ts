import type { DiscordUser } from "@iris/shared";
import { z } from "zod";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1)
});

const discordUserResponseSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional()
});

export const mockDiscordUser: DiscordUser = {
  id: "234567890123456789",
  username: "Yuki",
  displayName: "Yuki",
  avatarUrl: null
};

export async function exchangeDiscordCode(
  code: string,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<DiscordUser> {
  if (
    !env.DISCORD_CLIENT_ID ||
    !env.DISCORD_CLIENT_SECRET ||
    !env.DISCORD_REDIRECT_URI
  ) {
    throw new AppError(
      500,
      "discord_auth_unconfigured",
      "Discord authentication is not configured."
    );
  }

  const tokenBody = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI
  });

  const tokenResponse = await fetchFn("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody
  });

  if (!tokenResponse.ok) {
    throw new AppError(401, "discord_auth_failed", "Discord authentication failed.");
  }

  const tokenPayload = tokenResponseSchema.safeParse(await tokenResponse.json());
  if (!tokenPayload.success) {
    throw new AppError(401, "discord_auth_failed", "Discord authentication failed.");
  }

  const userResponse = await fetchFn("https://discord.com/api/users/@me", {
    headers: {
      authorization: `Bearer ${tokenPayload.data.access_token}`
    }
  });

  if (!userResponse.ok) {
    throw new AppError(401, "discord_auth_failed", "Discord authentication failed.");
  }

  const userPayload = discordUserResponseSchema.safeParse(await userResponse.json());
  if (!userPayload.success) {
    throw new AppError(401, "discord_auth_failed", "Discord authentication failed.");
  }

  const user = userPayload.data;
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.global_name || user.username,
    avatarUrl
  };
}
