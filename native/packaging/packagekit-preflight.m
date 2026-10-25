// Read-only local diagnostic. Private PackageKit selectors are runtime-checked.
// This program NEVER authorizes, creates an install session, submits a request,
// starts installation, or calls preflight operations that size/stage an install.
// It only parses component URLs and initializes an in-memory PKInstallRequest.
#import <Foundation/Foundation.h>

@interface NSObject (UKPackageKitReadOnly)
+ (id)packageWithURL:(NSURL *)url;
+ (id)requestWithPackages:(NSArray *)packages destination:(NSString *)destination;
- (id)initWithPackage:(id)package;
- (NSString *)packageIdentifier;
- (NSString *)packageVersion;
@end

int main(int argc, const char **argv) {
    @autoreleasepool {
        if (argc < 3) { fprintf(stderr, "Usage: packagekit-preflight ABSOLUTE_PRODUCT COMPONENT...\n"); return 2; }
        NSString *path = [NSString stringWithUTF8String:argv[1]];
        if (![path isAbsolutePath]) { fprintf(stderr, "Product path must be absolute\n"); return 2; }
        NSBundle *framework = [NSBundle bundleWithPath:@"/System/Library/PrivateFrameworks/PackageKit.framework"];
        Class packageClass = NSClassFromString(@"PKPackage");
        if (!packageClass) { [framework load]; packageClass = NSClassFromString(@"PKPackage"); }
        Class specifierClass = NSClassFromString(@"PKPackageSpecifier");
        Class requestClass = NSClassFromString(@"PKInstallRequest");
        if (![packageClass respondsToSelector:@selector(packageWithURL:)] ||
            ![specifierClass instancesRespondToSelector:@selector(initWithPackage:)] ||
            ![requestClass respondsToSelector:@selector(requestWithPackages:destination:)]) {
            fprintf(stderr, "Required read-only PackageKit parser API unavailable on this macOS\n"); return 3;
        }
        @try {
            NSMutableArray *specifiers = [NSMutableArray array];
            NSMutableArray *components = [NSMutableArray array];
            for (int i = 2; i < argc; i++) {
                NSString *name = [NSString stringWithUTF8String:argv[i]];
                NSURLComponents *url = [NSURLComponents componentsWithURL:[NSURL fileURLWithPath:path] resolvingAgainstBaseURL:NO];
                url.fragment = name;
                id package = [packageClass packageWithURL:url.URL];
                if (!package) { fprintf(stderr, "PackageKit rejected component URL: %s\n", url.URL.absoluteString.UTF8String); return 4; }
                id specifier = [[specifierClass alloc] initWithPackage:package];
                if (!specifier) { fprintf(stderr, "PackageKit rejected component specifier\n"); return 5; }
                [specifiers addObject:specifier];
                [components addObject:@{@"component":name, @"identifier":[package packageIdentifier] ?: @"", @"version":[package packageVersion] ?: @""}];
            }
            id request = [requestClass requestWithPackages:specifiers destination:@"/"];
            if (!request) { fprintf(stderr, "PackageKit rejected in-memory install request\n"); return 6; }
            NSDictionary *report = @{@"components":components, @"requestInitialized":@YES,
                                      @"installationStarted":@NO, @"authorizationRequested":@NO};
            NSData *json = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
            fwrite(json.bytes, 1, json.length, stdout); fputc('\n', stdout);
            return 0;
        } @catch (NSException *exception) {
            fprintf(stderr, "PackageKit parse exception: %s\n", exception.description.UTF8String); return 7;
        }
    }
}
