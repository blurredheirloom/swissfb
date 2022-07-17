import { createDbWorker } from "sql.js-httpvfs";

const workerUrl = new URL(
  "sql.js-httpvfs/dist/sqlite.worker.js",
  import.meta.url
);
const wasmUrl = new URL("sql.js-httpvfs/dist/sql-wasm.wasm", import.meta.url);

function getFBID(var url)
{
	const graphUrl = "https://graph.facebook.com/?id="+url+"&access_token=xxxxx&fields=id";
	var output = file_get_contents(graphUrl);
	output = json_decode(output, TRUE);
	return output["id"];
}

async function load() {

  const worker = await createDbWorker(
    [
      {
        from: "inline",
        config: {
		serverMode: "chunked",
		requestChunkSize: 4096,
		databaseLengthBytes: 2111004672,
		serverChunkSize: 48 * 1024 * 1024,
		urlPrefix: "db.sqlite3.",
        },
      },
    ],
    workerUrl.toString(),
    wasmUrl.toString(),
  );
            
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
      
  const type = urlParams.get('type');
  const value = urlParams.get('value');
  
      var result = null;

      
  if(type=="phone")
	result = await worker.db.query(`select * from person where phone = ?`, ["39"+value]);
  else if(type=="fbid")
	result = await worker.db.query(`select * from person where id = ?`, [value]);
  else if(value)
	result = await worker.db.query(`select * from person where upper(first_name) = ? and upper(second_name) = ?`, [value.toUpperCase(), value.toUpperCase()]);

      if(type&&value)
      {
	      const element = window.document.getElementById("details");

	      if(result && element != null)
	      {
			var stringified = JSON.stringify(result);
			var parsed = JSON.parse(stringified);
				element.innerHTML += "<li><h3>"+parsed[0].first_name+" "+parsed[0].second_name+"</h3></li>";
				element.innerHTML += "<li><h4>Telefono: <span>"+parsed[0].phone.substring(2)+"<span></h4></li>";
				element.innerHTML += "<li><h4>Facebook: <span><a href='http://www.facebook.com/"+parsed[0].id+"'>"+parsed[0].id+"</a><span></h4></li>";
			
	      }
      }
}

load();

