# Workboard

A projects app using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS. No dependency installation is needed.

Run:

```sh
npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. Project names are trimmed, validated, and displayed in creation order. Use each project's **Open project** button to view it and **Projects** to return.

Run the integration checks with:

```sh
npm test
```
