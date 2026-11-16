#[cfg(windows)]
fn main() {
    std::process::exit(uk_remapper_win::win::run(std::env::args().skip(1).collect()));
}

#[cfg(not(windows))]
fn main() {
    eprintln!("ultimate-keyboards-remapper-win runs on Windows only.");
    std::process::exit(2);
}
