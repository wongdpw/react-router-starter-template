import { createRequestHandler } from "react-router";
import { isValidRoomCode } from "../app/lib/battle-protocol";

export { BattleRoom } from "./battle-room";
export { GuessRoom } from "./guess-room";

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
const GUESS_WS = /^\/api\/guess\/([A-Za-z0-9]+)\/ws$/;

export default {
	fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Game rooms are handled by Durable Objects, one instance per room
		// code, rather than by the React Router handler.
		const battle = BATTLE_WS.exec(url.pathname);
		const guess = GUESS_WS.exec(url.pathname);
		const match = battle ?? guess;
		if (match) {
			const code = match[1].toUpperCase();
			if (!isValidRoomCode(code)) {
				return new Response("Invalid room code", { status: 400 });
			}
			url.searchParams.set("code", code);
			const ns = battle ? env.BATTLE_ROOM : env.GUESS_ROOM;
			return ns.get(ns.idFromName(code)).fetch(new Request(url, request));
		}

		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<Env>;
