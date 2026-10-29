// Bundled after the unchanged accepted P02/P03 processors and provider adapter.
class FinanceLabTransport {
  constructor() {
    this.description = {
      displayName: 'Finance Lab Transport',
      name: 'financeLabTransport',
      group: ['transform'],
      version: 1,
      description: 'Verified Evolution ingress and accepted M06 transport',
      defaults: { name: 'Finance Lab Transport' },
      inputs: ['main'],
      outputs: ['main'],
      credentials: [
        { name: 'httpHeaderAuth', required: true },
        { name: 'financeLabIngest', required: true },
        { name: 'financeLabEvolution', required: true },
      ],
      properties: [
        { displayName: 'Operational Release', name: 'enabled', type: 'boolean', default: false },
        ...[
          ['Instance Name', 'instance'],
          ['Instance UUID', 'instanceId'],
          ['Lab Account JID', 'ownerJid'],
          ['Evolution HTTPS Origin', 'evolutionUrl'],
        ].map(([displayName, name]) => ({
          displayName,
          name,
          type: 'string',
          default: '',
          required: true,
        })),
      ],
    };
  }
  async execute() {
    try {
      if (this.getNodeParameter('enabled', 0) !== true) return [[{ json: { stage: 'disabled' } }]];
      const origin = await this.getCredentials('httpHeaderAuth');
      if (origin.name !== 'x-finance-webhook')
        return [[{ json: { stage: 'configuration_rejected' } }]];
      const finance = await this.getCredentials('financeLabIngest');
      const evolution = await this.getCredentials('financeLabEvolution');
      const config = Object.fromEntries(
        ['enabled', 'instance', 'instanceId', 'ownerJid', 'evolutionUrl'].map((key) => [
          key,
          this.getNodeParameter(key, 0),
        ]),
      );
      const items = this.getInputData();
      if (items.length !== 1) return [[{ json: { stage: 'rejected' } }]];
      const result = await runLive(
        items[0].json,
        config,
        { webhook: origin.value, finance: finance.token, evolution: evolution.token },
        (options) => this.helpers.httpRequest(options),
        (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      );
      return [[{ json: result }]];
    } catch {
      return [[{ json: { stage: 'transport_failed' } }]];
    }
  }
}
module.exports = { FinanceLabTransport };
