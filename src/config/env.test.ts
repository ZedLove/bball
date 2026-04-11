import { describe, it, expect } from 'vitest';

describe('env configuration (static checks)', () => {
  describe('CONFIG values', () => {
    it('should have valid CONFIG export with all required fields', async () => {
      const { CONFIG } = await import('./env.ts');
      
      expect(CONFIG).toBeDefined();
      expect(CONFIG.PORT).toBeDefined();
      expect(typeof CONFIG.PORT).toBe('number');
      expect(CONFIG.PORT).toBeGreaterThan(0);
    });

    it('should have valid TEAM_ID', async () => {
      const { CONFIG } = await import('./env.ts');
      expect(CONFIG.TEAM_ID).toBeDefined();
      expect(typeof CONFIG.TEAM_ID).toBe('number');
      expect(CONFIG.TEAM_ID).toBeGreaterThan(0);
    });

    it('should have all polling intervals with valid defaults', async () => {
      const { CONFIG } = await import('./env.ts');
      expect(CONFIG.IDLE_POLL_INTERVAL).toBe(60);
      expect(CONFIG.ACTIVE_POLL_INTERVAL).toBe(10);
      expect(CONFIG.BATTING_POLL_INTERVAL).toBe(30);
      expect(CONFIG.BETWEEN_INNINGS_BUFFER_S).toBe(15);
    });

    it('should have valid retry settings', async () => {
      const { CONFIG } = await import('./env.ts');
      expect(CONFIG.MAX_RETRIES).toBe(3);
      expect(CONFIG.RETRY_BACKOFF_MS).toBe(500);
    });

    it('should have CORS_ORIGIN defined', async () => {
      const { CONFIG } = await import('./env.ts');
      expect(CONFIG.CORS_ORIGIN).toBeDefined();
      expect(typeof CONFIG.CORS_ORIGIN).toBe('string');
    });

    it('should have valid polling intervals that are positive integers', async () => {
      const { CONFIG } = await import('./env.ts');
      expect(CONFIG.IDLE_POLL_INTERVAL).toBeGreaterThan(0);
      expect(CONFIG.ACTIVE_POLL_INTERVAL).toBeGreaterThan(0);
      expect(CONFIG.BATTING_POLL_INTERVAL).toBeGreaterThan(0);
      expect(Number.isInteger(CONFIG.IDLE_POLL_INTERVAL)).toBe(true);
      expect(Number.isInteger(CONFIG.ACTIVE_POLL_INTERVAL)).toBe(true);
      expect(Number.isInteger(CONFIG.BATTING_POLL_INTERVAL)).toBe(true);
    });
  });

  describe('TEAMS data', () => {
    it('should have TEAMS imported and available', async () => {
      const dynamicImport = await import('./teams.ts');
      expect(dynamicImport.TEAMS).toBeDefined();
      expect(typeof dynamicImport.TEAMS).toBe('object');
    });

    it('should have all 30 MLB teams', async () => {
      const { TEAMS } = await import('./teams.ts');
      const teamCount = Object.keys(TEAMS).length;
      expect(teamCount).toBe(30);
    });

    it('should have valid team data structure', async () => {
      const { TEAMS } = await import('./teams.ts');
      const team = TEAMS['TOR'];
      expect(team).toBeDefined();
      expect(team.id).toBe(141);
      expect(team.name).toBe('Toronto Blue Jays');
    });

    it('should have key teams including NYM and STL', async () => {
      const { TEAMS } = await import('./teams.ts');
      expect(TEAMS['NYM']).toBeDefined();
      expect(TEAMS['STL']).toBeDefined();
      expect(TEAMS['TOR']).toBeDefined();
      expect(TEAMS['NYM'].id).toBe(121);
      expect(TEAMS['STL'].id).toBe(138);
    });
  });
});

