<?php
// ============================================================
// Minimal .env loader (no Composer dependency required).
// ============================================================

(function () {
    $envFile = __DIR__ . '/.env';

    if (!is_file($envFile) || !is_readable($envFile)) {
        return;
    }

    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {

        $line = trim($line);

        if ($line === '' || $line[0] === '#') {
            continue;
        }

        if (!str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);

        $key   = trim($key);
        $value = trim($value);


        if (strlen($value) >= 2 && (
            ($value[0] === '"' && $value[-1] === '"') ||
            ($value[0] === "'" && $value[-1] === "'")
        )) {
            $value = substr($value, 1, -1);
        }


        if ($key !== '' && getenv($key) === false) {

            putenv("$key=$value");

            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;

        }

    }

})();



// ============================================================
// Database configuration
// ============================================================

define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');

define('DB_NAME', getenv('DB_NAME') ?: 'water_management');

define('DB_USER', getenv('DB_USER') ?: 'root');

define('DB_PASS', getenv('DB_PASS') ?: '');



// ============================================================
// Application Environment
//
// dev  = show debugging information
// prod = hide sensitive information
//
// Production mode hides reset tokens and links from users.
// The reset link will only be sent through email.
// ============================================================

define(
    'APP_ENV',
    getenv('APP_ENV') ?: 'prod'
);



// ============================================================
// Allowed frontend origins for CORS
// ============================================================

$envOrigins = getenv('ALLOWED_ORIGINS');


$ALLOWED_ORIGINS = $envOrigins

    ? array_map('trim', explode(',', $envOrigins))

    : [

        'http://localhost:8080',

        'http://localhost:3000',

        'http://localhost:5173',

    ];