import {
  formatMaltlineCampaignTelemetry,
  runMaltlineCampaignTelemetry,
} from '../src/telemetry/campaign-telemetry';

process.stdout.write(formatMaltlineCampaignTelemetry(runMaltlineCampaignTelemetry()));
