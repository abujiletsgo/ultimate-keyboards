fn main() {
    println!("cargo:rerun-if-env-changed=UK_TEAM_ID");
    println!("cargo:rerun-if-changed=bridge");
    println!("cargo:rerun-if-changed=../vendor");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .cpp(true)
            .std("c++23")
            .file("bridge/native.cpp")
            .file("bridge/permission_setup.mm")
            .include("../vendor/include")
            .flag("-Wno-unused-parameter")
            .compile("uk_native");
        for framework in [
            "CoreFoundation",
            "IOKit",
            "Security",
            "SystemConfiguration",
            "ApplicationServices",
            "AppKit",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
}
