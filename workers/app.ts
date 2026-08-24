import { createRequestHandler } from "react-router";
import { isValidRoomCode } from "../app/lib/battle-protocol";

export { BattleRoom } from "./battle-room";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

const BATTLE_WS = /^\/api\/battle\/([A-Za-z0-9]+)\/ws$/;

export default {
	fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Draw Battle rooms are handled by a Durable Object, one per room
		// code, rather than by the React Router handler.
		const match = BATTLE_WS.exec(url.pathname);
		if (match) {
			const code = match[1].toUpperCase();
			if (!isValidRoomCode(code)) {
				return new Response("Invalid room code", { status: 400 });
			}
			url.searchParams.set("code", code);
			const id = env.BATTLE_ROOM.idFromName(code);
			return env.BATTLE_ROOM.get(id).fetch(new Request(url, request));
		}

		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<Env>;
