use rocket::tokio::fs::read_dir;
use rocket::State;
use std::path::Path;
use std::process::{Command, Stdio};
use tracing::{error, info, instrument};

use crate::errors::{ApiError, Result};
use crate::handlers::process::{do_process_command, fetch_process_result};
use crate::handlers::types::{ApiCommand, ApiCommandResult};
use crate::rate_limiter::RateLimited;
use crate::utils::lib::{CAIRO_COMPILERS_DIR, DEFAULT_CAIRO_DIR};
use crate::worker::WorkerEngine;

// Read the version from the cairo Cargo.toml file.
#[instrument(skip(_rate_limited))]
#[get("/cairo_version")]
pub async fn cairo_version(_rate_limited: RateLimited) -> String {
    info!("/cairo_version");
    do_cairo_version().unwrap_or_else(|e| format!("Failed to get cairo version: {:?}", e))
}

// Read the version from the cairo Cargo.toml file.
#[instrument(skip(engine, _rate_limited))]
#[get("/cairo_version_async")]
pub async fn cairo_version_async(
    engine: &State<WorkerEngine>,
    _rate_limited: RateLimited,
) -> String {
    info!("/cairo_version_async");
    do_process_command(ApiCommand::CairoVersion, engine)
}

#[instrument(skip(engine))]
#[get("/cairo_version_result/<process_id>")]
pub async fn get_cairo_version_result(process_id: String, engine: &State<WorkerEngine>) -> String {
    fetch_process_result(process_id, engine, |result| match result {
        ApiCommandResult::CairoVersion(version) => version.to_string(),
        _ => String::from("Result not available"),
    })
}

/// Run Cairo --version to return Cairo version string
///
/// ## Note
/// (default Cairo version will be used)
pub fn do_cairo_version() -> Result<String> {
    let mut version_caller = Command::new("cargo");
    version_caller.current_dir(DEFAULT_CAIRO_DIR);
    match String::from_utf8(
        version_caller
            .arg("run")
            .arg("-q")
            .arg("--release")
            .arg("--bin")
            .arg("cairo-compile")
            .arg("--")
            .arg("--version")
            .stdout(Stdio::piped())
            .spawn()
            .map_err(ApiError::FailedToExecuteCommand)?
            .wait_with_output()
            .map_err(ApiError::FailedToReadOutput)?
            .stdout,
    ) {
        Ok(version) => Ok(version),
        Err(e) => {
            error!("{:?}", e.to_string());
            Err(ApiError::UTF8Error(e))
        }
    }
}

#[instrument]
#[get("/cairo_versions")]
pub async fn cairo_versions() -> String {
    do_cairo_versions()
        .await
        .unwrap_or_else(|e| format!("Failed to get cairo versions: {:?}", e))
}

/// Get cairo versions
pub async fn do_cairo_versions() -> crate::errors::Result<String> {
    let path = Path::new(CAIRO_COMPILERS_DIR);

    let mut dir = read_dir(path).await.map_err(ApiError::FailedToReadDir)?;
    let mut result = vec![];

    while let Ok(Some(entry)) = dir.next_entry().await {
        let entry = entry;
        let path = entry.path();
        if path.is_dir() {
            result.push(entry.file_name().to_string_lossy().to_string());
        }
    }

    Ok(format!("{:?}", result))
}
