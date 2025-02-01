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
    let mut url = String::from("http://localhost:8888/cli-proxy");
    let mut url_query = String::new();

    url_query.push_str("?cwd=");
    url_query.push_str(&encode(env::current_dir().unwrap().to_str().unwrap()));

    let mut last_key: Option<String> = None;

    for arg in args[1..].iter() {
        if arg.starts_with("--") {
            if let Some(key) = last_key {
                url_query.push('&');
                url_query.push_str(&encode(&key[2..]));
                url_query.push_str("=true");
            }
            last_key = Some(arg.to_string());
        } else {
            if let Some(key) = last_key {
                url_query.push('&');
                url_query.push_str(&encode(&key[2..]));
                url_query.push_str("=");
                url_query.push_str(&encode(arg));
                last_key = None;
            } else {
                url.push('/');
                url.push_str(&encode(arg));
            }
        }
    }

    if let Some(key) = last_key {
        url_query.push('&');
        url_query.push_str(&encode(&key[2..]));
        url_query.push_str("=true");
    }

    url.push_str(&url_query);

    let req = client.get(url.as_str());

    let res = req.send().await.unwrap();

    println!("{}", res.text().await.unwrap());
}
