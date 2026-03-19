import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'b2mcdo5v',
    dataset: 'production',
  },
  server: {
    port: 3334,
  },
})
