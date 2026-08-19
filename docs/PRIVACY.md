# ArcadeBench privacy promise

ArcadeBench is a free, non-commercial, open-source arcade. We are here to make
games, not to turn players into a dataset.

- We do not sell player data, build advertising profiles, or run ads.
- We do not use gameplay, replays, prompts, or controllers to train AI.
- Complete replay payloads expire after five days and are automatically
  deleted. This includes ranked-score verification proofs and opt-in shares.
- Permanent leaderboard records contain the public callsign and score summary,
  game metadata, verification state, and replay SHA-256 hash—not playable replay
  inputs.

Ordinary gameplay, downloaded replay files, and Replay Lab inspection happen
on the player's device. A complete replay is uploaded only when a ranked score
is submitted for verification or when the player explicitly selects **Share
for 5 days**.

The accountless service uses a signed anonymous cookie for up to 30 days so
one-time score challenges, voting, and rate limits work. ArcadeBench does not
write IP addresses into its application database. Cloudflare may process
ordinary network and security metadata as the infrastructure provider.

Public callsigns receive deterministic checks first. On a cache miss, only the
proposed callsign is sent to Cloudflare Workers AI for a safety category. The
model never receives gameplay, replay data, prompts, controller code, or score
values. Accepted callsigns are stored with public scores. Rejected raw
callsigns are not stored; the cache retains a hash of the normalized value and
policy version.

The operator runs a Twilio number for personal operational SMS alerts
(experiment status, service health); the only recipient is the operator.
Mobile phone numbers are never shared, sold, rented, or used for marketing.
Message frequency varies with alert settings, up to roughly 50 messages per
day. Message and data rates may apply. Reply STOP to opt out and HELP for
help.

The production promise is published at <https://arcadebench.org/privacy/>. The
retention migration, cleanup job, public copy, and tests live in this repository
so changes to policy and behavior can be reviewed together.
