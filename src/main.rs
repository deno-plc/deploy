use reqwest::Client;
use std::env;
use urlencoding::encode;

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <command> --key value [--key value ...]", args[0]);
        return;
    }

    let client = Client::new();

    let args = serde_json::to_string(&args[1..]).unwrap();

    let req = client.get(format!(
        "http://localhost:8888/cli-proxy/exec?auth=localhost&cmd={}&cwd={}",
        encode(&args),
        encode(&env::current_dir().unwrap().to_string_lossy())
    ));

    let res = req.send().await.unwrap();

    println!("{}", res.text().await.unwrap());
}
