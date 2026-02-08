import { preprocessPlayer } from "./ejs/src/yt/solver/solvers.ts";

self.onmessage = (e: MessageEvent<string>) => {
    try {
        if (!e.data || typeof e.data !== 'string') {
            throw new Error('Invalid input: expected string');
        }
        
        if (e.data.length === 0) {
            throw new Error('Empty player script');
        }
        
        if (e.data.length > 10000000) { // 10MB limit
            throw new Error(`Player script too large: ${e.data.length} bytes`);
        }
        
        const output = preprocessPlayer(e.data);
        
        if (!output || typeof output !== 'string') {
            throw new Error('Preprocessing failed: invalid output');
        }
        
        if (output.length === 0) {
            throw new Error('Preprocessing produced empty output');
        }
        
        self.postMessage({ type: 'success', data: output });
    } catch (error) {
        let errorMessage = 'Unknown error';
        let errorStack: string | undefined;
        
        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && typeof error === 'object') {
            errorMessage = JSON.stringify(error);
        }
        
        console.error('Worker preprocessing error:', errorMessage);
        if (errorStack) {
            console.error('Stack trace:', errorStack);
        }
        
        self.postMessage({
            type: 'error',
            data: {
                message: errorMessage,
                stack: errorStack,
            }
        });
    }
};