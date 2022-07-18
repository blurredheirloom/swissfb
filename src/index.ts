import { createDbWorker } from "sql.js-httpvfs";
import $ from 'jquery';


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
		serverChunkSize: 48 * 1024 * 1024,
		urlPrefix: "db.sqlite3.",
        },
      },
    ],
    workerUrl.toString(),
    wasmUrl.toString(),
  );

      $(".loader").hide();
      $(".result").hide();
      
 
            
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
      
  const type = urlParams.get('type');
  const value = urlParams.get('value');
  
	var result = null;
      
	if(type=="phone")
		result = await worker.db.query(`select * from person where phone = ?`, ["39"+value]);
	else if(type=="fbid")
		result = await worker.db.query(`select * from person where id = ?`, [value]);
	else if(type=="fullname" && value)
	{
		const array = value.toUpperCase().trim().split(/\s+/);
		result = await worker.db.query(`select * from person where upper(first_name) = ? and upper(second_name) = ?`, [array[0], array[1]]);
	}
	
	if(type&&value)
	{
		$(".loader").show();
      
		const element = window.document.getElementById("details");

		if(result && element != null)
		{
			$(".loader").hide();
			$(".result").show();
			var stringified = JSON.stringify(result);
			var parsed = JSON.parse(stringified);
				element.innerHTML += "<li><h3>"+parsed[0].first_name+" "+parsed[0].second_name+"</h3></li>";
				element.innerHTML += "<li><h4>Telefono: <span>"+parsed[0].phone.substring(2)+"<span></h4></li>";
				element.innerHTML += "<li><h4>Facebook: <span><a href='http://www.facebook.com/"+parsed[0].id+"'>"+parsed[0].id+"</a><span></h4></li>";
			
		}
	}
}

load();

