import { createDbWorker } from "sql.js-httpvfs";

const workerUrl = new URL(
  "sql.js-httpvfs/dist/sqlite.worker.js",
  import.meta.url
);
const wasmUrl = new URL("sql.js-httpvfs/dist/sql-wasm.wasm", import.meta.url);


async function load() {

  const worker = await createDbWorker(
    [
      {
        from: "inline",
        config: {
		serverMode: "chunked",
		requestChunkSize: 4096,
		databaseLengthBytes: 2111004672,
		serverChunkSize: 10 * 1024 * 1024,
		urlPrefix: "db.sqlite3.",
        },
      },
    ],
    workerUrl.toString(),
    wasmUrl.toString(),
  );
      
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
      
  const tel = urlParams.get('phone');
  const id = urlParams.get('id');
  const name = urlParams.get('name');
  const surname =urlParams.get('surname');
      
  var result = null;
      
  if(tel)
	result = await worker.db.query(`select * from person where phone = ?`, ["39"+tel]);
  else if(id)
	result = await worker.db.query(`select * from person where id = ?`, [id]);
  else if(name && surname)
	result = await worker.db.query(`select * from person where upper(first_name) = ? and upper(second_name) = ?`, [name.toUpperCase(), surname.toUpperCase()]);

  document.body.textContent = JSON.stringify(result);
}

load();
