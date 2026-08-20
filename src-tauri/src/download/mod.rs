//! Download engine.
//!
//! The engine is UI-agnostic: it owns task state, streams authorized content
//! to disk, and reports progress through Tauri events. Stream URLs are never
//! resolved by the engine itself — the media provider re-checks authorization
//! and returns a directly downloadable URL for the selected format.

pub mod manager;
pub mod models;
pub mod stream;

pub use manager::DownloadManager;
pub use models::DownloadTask;