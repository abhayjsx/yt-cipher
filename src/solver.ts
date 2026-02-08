import { execInPool } from "./workerPool.ts";
import { getPlayerFilePath } from "./playerCache.ts";
import { preprocessedCache } from "./preprocessedCache.ts";
import { solverCache } from "./solverCache.ts";
import { getFromPrepared } from "../ejs/src/yt/solver/solvers.ts";
import type { Solvers } from "./types.ts";
import { formatLogMessage } from "./utils.ts";

export async function getSolvers(player_url: string): Promise<Solvers | null> {
    try {
        const playerCacheKey = await getPlayerFilePath(player_url);

        let solvers = solverCache.get(playerCacheKey);

        if (solvers) {
            console.log(formatLogMessage('debug', 'Solvers found in cache', { player_url }));
            return solvers;
        }

        let preprocessedPlayer = preprocessedCache.get(playerCacheKey);
        if (!preprocessedPlayer) {
            console.log(formatLogMessage('debug', 'Preprocessing player script', { player_url }));
            
            try {
                const rawPlayer = await Deno.readTextFile(playerCacheKey);
                console.log(formatLogMessage('debug', 'Player script loaded', { 
                    player_url, 
                    size: rawPlayer.length 
                }));
                
                preprocessedPlayer = await execInPool(rawPlayer);
                preprocessedCache.set(playerCacheKey, preprocessedPlayer);
                console.log(formatLogMessage('debug', 'Player script preprocessed', { player_url }));
            } catch (error) {
                console.error(formatLogMessage('error', 'Failed to preprocess player script', {
                    player_url,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                }));
                throw error;
            }
        }
        
        try {
            solvers = getFromPrepared(preprocessedPlayer);
            if (solvers) {
                solverCache.set(playerCacheKey, solvers);
                console.log(formatLogMessage('debug', 'Solvers generated successfully', { player_url }));
                return solvers;
            }
        } catch (error) {
            console.error(formatLogMessage('error', 'Failed to generate solvers from preprocessed player', {
                player_url,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            }));
            throw error;
        }

        console.warn(formatLogMessage('warn', 'No solvers generated from player script', { player_url }));
        return null;
    } catch (error) {
        console.error(formatLogMessage('error', 'getSolvers failed', {
            player_url,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        }));
        throw error;
    }
}