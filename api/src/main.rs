#[macro_use]
extern crate rocket;

pub mod cors;
pub mod errors;
pub mod handlers;
mod metrics;
pub mod rate_limiter;
pub mod tracing_log;
pub mod utils;
pub mod worker;

use anyhow::Context;
use handlers::cairo_version::{
    cairo_version, cairo_version_async, cairo_versions, get_cairo_version_result,
};
use handlers::compile_casm::{compile_to_casm, compile_to_casm_async, compile_to_casm_result};
use handlers::compile_sierra::{
    compile_to_siera_async, compile_to_sierra, get_siera_compile_result,
};
use handlers::process::get_process_status;
use handlers::save_code::save_code;
use handlers::scarb_compile::{get_scarb_compile_result, scarb_compile, scarb_compile_async};
use handlers::scarb_test::{get_scarb_test_result, scarb_test_async};
use handlers::utils::on_plugin_launched;
use handlers::{health, who_is_this};
use prometheus::Registry;
use rocket::{Build, Config, Rocket};
use std::env;
use std::net::Ipv4Addr;
use tracing::{info, instrument};

use crate::cors::CORS;
use crate::metrics::{initialize_metrics, Metrics};
use crate::rate_limiter::RateLimiter;
use crate::tracing_log::init_logger;
use crate::worker::WorkerEngine;

fn create_metrics_server(registry: Registry) -> Rocket<Build> {
    const DEFAULT_PORT: u16 = 8001;
    let port = match env::var("METRICS_PORT") {
        Ok(val) => val.parse::<u16>().unwrap_or(DEFAULT_PORT),
        Err(_) => DEFAULT_PORT,
    };

    let config = Config {
        port,
        address: Ipv4Addr::UNSPECIFIED.into(),
        ..Config::default()
    };

    rocket::custom(config)
        .manage(registry)
        .mount("/", routes![metrics::metrics])
}

#[instrument(skip(metrics))]
fn create_app(metrics: Metrics) -> Rocket<Build> {
    let number_of_workers = match std::env::var("WORKER_THREADS") {
        Ok(v) => v.parse::<u32>().unwrap_or(2u32),
        Err(_) => 2u32,
    };

    let queue_size = match std::env::var("QUEUE_SIZE") {
        Ok(v) => v.parse::<usize>().unwrap_or(1_000),
        Err(_) => 1_000,
    };

    // Launch the worker processes
    let mut engine = WorkerEngine::new(number_of_workers, queue_size, metrics.clone());
    engine.start();

    info!("Number of workers: {}", number_of_workers);
    info!("Queue size: {}", queue_size);

    info!("Starting Rocket webserver...");

    rocket::build()
        .manage(engine)
        .attach(CORS)
        .manage(RateLimiter::new())
        .attach(metrics)
        .mount(
            "/",
            routes![
                compile_to_sierra,
                compile_to_siera_async,
                get_siera_compile_result,
                compile_to_casm,
                compile_to_casm_async,
                compile_to_casm_result,
                scarb_compile,
                scarb_compile_async,
                get_scarb_compile_result,
                save_code,
                cairo_versions,
                cairo_version,
                cairo_version_async,
                get_cairo_version_result,
                get_process_status,
                health,
                who_is_this,
                get_scarb_test_result,
                scarb_test_async,
                on_plugin_launched,
            ],
        )
}

#[rocket::main]
async fn main() -> anyhow::Result<()> {
    init_logger().context("Failed to initialize logger")?;

    let registry = Registry::new();
    let metrics = initialize_metrics(registry.clone()).context("Failed to initialize metrics")?;

    let app_server = create_app(metrics);
    let metrics_server = create_metrics_server(registry.clone());

    let (app_result, metrics_result) =
        rocket::tokio::join!(app_server.launch(), metrics_server.launch());
    app_result?;
    metrics_result?;

    Ok(())
}
