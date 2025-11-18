<?php
/**
 * Crunchbase API Client
 * 
 * A PHP class for interacting with the Crunchbase API v4
 */

class CrunchbaseAPI {
    private $apiKey;
    private $baseUrl;
    private $timeout;
    
    /**
     * Constructor
     * 
     * @param string $apiKey Your Crunchbase API key
     * @param string $baseUrl API base URL (default: https://api.crunchbase.com/api/v4)
     * @param int $timeout Request timeout in seconds
     */
    public function __construct($apiKey, $baseUrl = 'https://api.crunchbase.com/api/v4', $timeout = 30) {
        $this->apiKey = $apiKey;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
    }
    
    /**
     * Make a GET request to the Crunchbase API
     * 
     * @param string $endpoint API endpoint (e.g., 'entities/organizations/crunchbase')
     * @param array $params Additional query parameters
     * @return array Decoded JSON response
     * @throws Exception If the request fails
     */
    public function get($endpoint, $params = []) {
        $url = $this->buildUrl($endpoint, $params);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/json',
            'User-Agent: Crunchbase-API-PHP-Client/1.0'
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        
        curl_close($ch);
        
        if ($error) {
            throw new Exception("cURL Error: " . $error);
        }
        
        if ($httpCode !== 200) {
            $errorData = json_decode($response, true);
            $errorMessage = isset($errorData['message']) ? $errorData['message'] : "HTTP Error: $httpCode";
            throw new Exception($errorMessage, $httpCode);
        }
        
        $data = json_decode($response, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("JSON Decode Error: " . json_last_error_msg());
        }
        
        return $data;
    }
    
    /**
     * Build the full API URL with authentication
     * 
     * @param string $endpoint API endpoint
     * @param array $params Additional query parameters
     * @return string Complete URL
     */
    private function buildUrl($endpoint, $params = []) {
        $endpoint = ltrim($endpoint, '/');
        $url = $this->baseUrl . '/' . $endpoint;
        
        // Add API key as query parameter
        $params['user_key'] = $this->apiKey;
        
        // Build query string
        if (!empty($params)) {
            $url .= '?' . http_build_query($params);
        }
        
        return $url;
    }
    
    /**
     * Get organization information by permalink
     * 
     * @param string $permalink Organization permalink (e.g., 'crunchbase', 'apple')
     * @return array Organization data
     */
    public function getOrganization($permalink) {
        return $this->get("entities/organizations/{$permalink}");
    }
    
    /**
     * Get person information by permalink
     * 
     * @param string $permalink Person permalink
     * @return array Person data
     */
    public function getPerson($permalink) {
        return $this->get("entities/people/{$permalink}");
    }
    
    /**
     * Search organizations
     * 
     * @param string $query Search query
     * @param array $options Additional search options
     * @return array Search results
     */
    public function searchOrganizations($query, $options = []) {
        $params = array_merge(['query' => $query], $options);
        return $this->get('searches/organizations', $params);
    }
    
    /**
     * Search people
     * 
     * @param string $query Search query
     * @param array $options Additional search options
     * @return array Search results
     */
    public function searchPeople($query, $options = []) {
        $params = array_merge(['query' => $query], $options);
        return $this->get('searches/people', $params);
    }
    
    /**
     * Get funding rounds for an organization
     * 
     * @param string $permalink Organization permalink
     * @return array Funding rounds data
     */
    public function getFundingRounds($permalink) {
        return $this->get("entities/organizations/{$permalink}/cards/funding_rounds");
    }
    
    /**
     * Get acquisitions for an organization
     * 
     * @param string $permalink Organization permalink
     * @return array Acquisitions data
     */
    public function getAcquisitions($permalink) {
        return $this->get("entities/organizations/{$permalink}/cards/acquisitions");
    }
}

