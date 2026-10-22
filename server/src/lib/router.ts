import { Router, type RequestHandler, type Router as ExpressRouter } from 'express';

// Express 4 does not forward rejected promises to the error middleware, so an
// async handler that throws kills the process (Node >= 15). Wrap every handler
// registered on these routers and hand failures to next().
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'] as const;

function wrap(handler: RequestHandler): RequestHandler {
    return (req, res, next) => {
        try {
            Promise.resolve(handler(req, res, next)).catch(next);
        } catch (error) {
            next(error);
        }
    };
}

export function createSafeRouter(): ExpressRouter {
    const router = Router();
    const mutable = router as unknown as Record<string, (...args: unknown[]) => unknown>;

    for (const method of METHODS) {
        const original = mutable[method].bind(router);
        mutable[method] = (...args: unknown[]) =>
            original(...args.map((arg) => (typeof arg === 'function' ? wrap(arg as RequestHandler) : arg)));
    }

    return router;
}