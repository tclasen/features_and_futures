# Workboard pilot workload

Workboard is a browser application whose business behavior is defined only by the current cumulative task packet. Implement the disclosed requirements checkpoint; future features and the PM backlog are not part of this packet. Do not expose business controls for undispatched features. Presentation choices and internal architecture remain independent.

Every builder uses Node.js 22.22.1, JavaScript ES modules, built-in HTTP (node:http) and SQLite (node:sqlite), and browser HTML/CSS/JavaScript. No external application dependencies are required or permitted in this pilot. This keeps package installation and network access outside the measured feature work.

The shared start command is `npm start`. The server entry point is `server.js`; internal module layout is independent. Bind to `0.0.0.0` at `PORT` (default 8080). Use the SQLite file at `DB_PATH`, preserving data across process restarts. Serve `GET /health` as JSON `{"status":"ok"}`.

Requirements specify accessible UI labels and observable row boundaries for a common acceptance surface. The PM's Playwright source remains outside builder sandboxes. Application code and tests are independently owned by each builder.

The pilot verifies measurement and orchestration, not an instruction effect. A main run may grow this workload through additions and revisions after its evidence method has been frozen.

Submission boundary: `git status --porcelain` must be empty at submission, including runtime and untracked files. The submitted commit is the exact application tree the PM will validate.
