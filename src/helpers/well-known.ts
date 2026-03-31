import type { Request, Response, NextFunction } from 'express';
import type { VvsAgentRecord } from '../vvs/types';

export type AgentLookup = (agentName: string) => Promise<VvsAgentRecord | null> | VvsAgentRecord | null;

/**
 * Express middleware to serve .well-known/venmail-agent/:name endpoint
 */
export function venmailWellKnown(lookupAgent: AgentLookup) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const match = req.path.match(/^\/\.well-known\/venmail-agent\/(.+)$/);
    if (!match || req.method !== 'GET') return next();

    const agentName = decodeURIComponent(match[1]);
    try {
      const agent = await lookupAgent(agentName);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json(agent);
    } catch {
      return res.status(500).json({ error: 'Internal error' });
    }
  };
}
