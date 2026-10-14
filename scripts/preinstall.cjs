const agent = process.env.npm_config_user_agent || '';
if (!agent.startsWith('pnpm/')) {
  console.error('Use pnpm to install this workspace.');
  process.exit(1);
}
