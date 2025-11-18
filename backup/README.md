# Crunchbase API PHP Connection

A sample PHP implementation for connecting to the Crunchbase API v4.

## Prerequisites

- PHP 7.0 or higher
- cURL extension enabled
- A valid Crunchbase API key (get one at [data.crunchbase.com](https://data.crunchbase.com))

## Setup

1. **Get your API Key**
   - Sign up for a Crunchbase Data account at https://data.crunchbase.com
   - Obtain your API key from your account dashboard

2. **Configure the API Key**
   - Open `config.php`
   - Replace `'YOUR_API_KEY'` with your actual Crunchbase API key

## Files

- `config.php` - Configuration file for API credentials
- `CrunchbaseAPI.php` - Main API client class
- `example.php` - Usage examples demonstrating various API calls
- `README.md` - This file

## Usage

### Basic Usage

```php
require_once 'CrunchbaseAPI.php';

$config = require 'config.php';
$api = new CrunchbaseAPI($config['api_key']);

// Get organization information
$org = $api->getOrganization('crunchbase');
print_r($org);
```

### Available Methods

#### Get Organization
```php
$organization = $api->getOrganization('crunchbase');
```

#### Get Person
```php
$person = $api->getPerson('elon-musk');
```

#### Search Organizations
```php
$results = $api->searchOrganizations('artificial intelligence', ['limit' => 10]);
```

#### Search People
```php
$results = $api->searchPeople('elon musk', ['limit' => 10]);
```

#### Get Funding Rounds
```php
$funding = $api->getFundingRounds('crunchbase');
```

#### Get Acquisitions
```php
$acquisitions = $api->getAcquisitions('crunchbase');
```

#### Custom API Call
```php
$data = $api->get('entities/organizations/apple', ['field_ids' => 'name,description']);
```

## Running Examples

Run the example file from the command line:

```bash
php example.php
```

Or access it via web browser if you have a web server configured.

## Error Handling

The API client includes error handling for:
- Network errors (cURL errors)
- HTTP errors (non-200 status codes)
- JSON decode errors

All methods throw exceptions that should be caught:

```php
try {
    $org = $api->getOrganization('crunchbase');
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
```

## API Rate Limits

Be aware of Crunchbase API rate limits. The API client includes a timeout setting, but you should implement rate limiting in your application if making multiple requests.

## Documentation

For more information about the Crunchbase API, visit:
- Official API Documentation: https://data.crunchbase.com/v3.1/docs
- API Reference: https://data.crunchbase.com/v3.1/docs/using-the-api

## License

This is a sample implementation for demonstration purposes.

