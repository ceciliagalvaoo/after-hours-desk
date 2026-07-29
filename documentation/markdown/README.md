# After Hours Desk: Documentation (GitHub-readable mirror)

This folder is a GitHub-readable Markdown mirror of the **After Hours Desk** documentation (the full
site is at **https://ceciliagalvaoo.github.io/after-hours-desk/**). Every page is mirrored here so it
can be read without opening Docusaurus, straight from the repo, by a judge or an AI.

Same content, same diagrams, same screenshots, rendered with GitHub-Flavored Markdown instead of
Docusaurus. Mermaid flowcharts render natively on GitHub; the admonitions become GitHub alert
blockquotes; every image points back into `documentation/static/img/`. The Broker still runs the tour.

<p align="center">
  <a href="https://youtu.be/ahGHJuBm0xs"><img src="https://img.youtube.com/vi/ahGHJuBm0xs/maxresdefault.jpg" alt="Watch the After Hours Desk demo on YouTube: a 3-minute walkthrough of the confidential dark pool" width="560" /></a>
</p>

**[🎬 Watch the demo →](https://youtu.be/ahGHJuBm0xs)**

## Table of contents

### Overview

- [After Hours Desk (home)](./intro.md): what this is, live deployment addresses, where to go next
- [Problem & Solution](./problem-and-solution.md): why dark pools need confidentiality, and why that's hard on a public chain

### Evaluation Criteria

- [Evaluation Criteria](./evaluation-criteria.md): how the desk answers each line of the hackathon rubric, with pointers to proof

### How It Works

- [Architecture](./how-it-works/architecture.md): contracts, the Nox primitive composition, the ACL model, the frontend
- [Nox Integration](./how-it-works/nox-integration.md): what building on Nox is actually like, distilled from `feedback.md`

### Using It

- [User Flows & UX](./using-it/user-flows.md): real, screenshotted walkthroughs of every screen and role
- [Setup & Deployment](./using-it/setup-and-deployment.md): run the real project yourself

### Project

- [Roadmap](./project/roadmap.md): what a production version looks like beyond this hackathon
- [Team](./project/team.md): who built this
- [Feedback Summary](./project/feedback-summary.md): the highest-signal moments from the Nox integration log
