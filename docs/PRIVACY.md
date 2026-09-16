# ArcadeBench privacy promise

Effective September 15, 2026 (v2).

ArcadeBench is a free, non-commercial, open-source arcade.

- No ads, player-data sales, advertising profiles, or AI training using
  gameplay, replays, prompts, or controllers.
- Earlier ranked submissions and explicit replay shares keep their original
  five-day deletion deadline.
- The new score form explains that qualifying Top 50 replays are saved
  privately without scheduled expiration, even after later displacement.
  Nonqualifying proofs expire after five days.
- The separate social-media checkbox starts unchecked for every run. It does
  not affect ranking, qualification, retention, or appearance of the public
  score summary in the activity feed. It never authorizes AI training.

A replay is uploaded only for ranked verification or when a player explicitly
shares it. Local gameplay and local replay inspection do not upload files.
Saved replay files have no public playback endpoint. Their public records
contain a moderated callsign, verified result, game/board metadata, date,
placement when submitted, verification state, and replay hash.

## Community feedback

Players may vote up/down on supported game items and optionally send a private
note to ArcadeBench maintainers. Notes are never public comments, never included
in activity events or vote totals, and never sent to an AI model. Notes expire
90 days after their last explicit update. Updating only a vote does not extend
note retention. Clearing a vote does not delete a note; notes can be cleared
separately while the same anonymous browser session remains available.

There are no player accounts. Signed anonymous cookies last up to 30 days and
support one-time challenges, votes, feedback editing, and rate limits. Losing
the cookie loses access to that anonymous session's editing controls.
Accountless voting is not proof of one unique human. ArcadeBench does not
write IP addresses into its application database. Cloudflare may process
ordinary network/security metadata needed to operate the service.

Public callsigns receive deterministic checks first. On a cache miss, only the
proposed callsign is sent to Cloudflare Workers AI for a safety category.
Gameplay, replays, scores, controller code, and private notes are not sent.
Accepted names appear with scores; rejected raw names are not retained in the
moderation cache, which uses a hash and policy version.

D1 stores public summaries, permission records, and private feedback separately.
R2 holds temporary proof/share objects and private Top 50 archives.
The production promise is at https://arcadebench.org/privacy/.
