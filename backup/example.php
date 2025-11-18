<?php
/**
 * Crunchbase API Usage Examples
 * 
 * This file demonstrates how to use the CrunchbaseAPI class
 */

require_once 'CrunchbaseAPI.php';

// Load configuration
$config = require 'config.php';

// Check if API key is set
if (empty($config['api_key']) || $config['api_key'] === 'YOUR_API_KEY') {
    die("ERROR: Please set your Crunchbase API key in config.php\n");
}

// Initialize the API client
$api = new CrunchbaseAPI($config['api_key'], $config['api_base_url'], $config['timeout']);

echo "=== Crunchbase API Examples ===\n\n";

// Example 1: Get organization information
echo "Example 1: Get Organization Information\n";
echo "----------------------------------------\n";
try {
    $organization = $api->getOrganization('crunchbase');
    
    if (isset($organization['properties'])) {
        $props = $organization['properties'];
        echo "Name: " . ($props['name'] ?? 'N/A') . "\n";
        echo "Description: " . (isset($props['short_description']) ? substr($props['short_description'], 0, 100) . '...' : 'N/A') . "\n";
        echo "Website: " . ($props['website'] ?? 'N/A') . "\n";
        echo "Founded: " . ($props['founded_on'] ?? 'N/A') . "\n";
        echo "Location: " . ($props['location_identifiers'][0]['value'] ?? 'N/A') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n\n";

// Example 2: Search organizations
echo "Example 2: Search Organizations\n";
echo "--------------------------------\n";
try {
    $results = $api->searchOrganizations('artificial intelligence', ['limit' => 5]);
    
    if (isset($results['entities'])) {
        echo "Found " . count($results['entities']) . " organizations:\n";
        foreach ($results['entities'] as $index => $entity) {
            $name = $entity['properties']['name'] ?? 'Unknown';
            echo ($index + 1) . ". {$name}\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n\n";

// Example 3: Get funding rounds
echo "Example 3: Get Funding Rounds\n";
echo "-----------------------------\n";
try {
    $funding = $api->getFundingRounds('crunchbase');
    
    if (isset($funding['entities'])) {
        echo "Funding rounds found: " . count($funding['entities']) . "\n";
        foreach ($funding['entities'] as $index => $round) {
            $props = $round['properties'];
            $name = $props['announced_on'] ?? 'Unknown date';
            $amount = isset($props['money_raised']) ? '$' . number_format($props['money_raised']) : 'N/A';
            echo ($index + 1) . ". Date: {$name}, Amount: {$amount}\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n\n";

// Example 4: Search people
echo "Example 4: Search People\n";
echo "------------------------\n";
try {
    $results = $api->searchPeople('elon musk', ['limit' => 3]);
    
    if (isset($results['entities'])) {
        echo "Found " . count($results['entities']) . " people:\n";
        foreach ($results['entities'] as $index => $entity) {
            $name = $entity['properties']['name'] ?? 'Unknown';
            $title = $entity['properties']['title'] ?? 'N/A';
            echo ($index + 1) . ". {$name} - {$title}\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n\n";

// Example 5: Custom API call
echo "Example 5: Custom API Call\n";
echo "-------------------------\n";
try {
    // Example: Get a specific person's information
    $person = $api->getPerson('elon-musk');
    
    if (isset($person['properties'])) {
        $props = $person['properties'];
        echo "Name: " . ($props['name'] ?? 'N/A') . "\n";
        echo "Title: " . ($props['title'] ?? 'N/A') . "\n";
        echo "Bio: " . (isset($props['bio']) ? substr($props['bio'], 0, 150) . '...' : 'N/A') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

echo "\n=== Examples Complete ===\n";

