-- Database initialization script for Startup Idea Terminal
-- This script creates the necessary tables and indexes

-- Create ideas table (main table for storing idea submissions)
CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    keywords TEXT[], -- Array of keywords for clustering
    status VARCHAR(50) DEFAULT 'submitted', -- submitted, mvp, paying, launched
    mrr DECIMAL(10, 2), -- Monthly Recurring Revenue if applicable
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER, -- Optional: link to user if you have user system
    metadata JSONB -- Store additional flexible data
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_keywords ON ideas USING GIN(keywords);

-- Create index for date range queries (for WoW calculations)
CREATE INDEX IF NOT EXISTS idx_ideas_date_range ON ideas(created_at, category);

-- Optional: Create a view for category statistics
CREATE OR REPLACE VIEW category_stats AS
SELECT 
    category,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE status = 'mvp') as mvp_count,
    COUNT(*) FILTER (WHERE status = 'paying') as paying_count,
    COUNT(*) FILTER (WHERE status = 'launched') as launched_count,
    AVG(mrr) FILTER (WHERE mrr > 0) as avg_mrr
FROM ideas
WHERE category IS NOT NULL
GROUP BY category;

-- Optional: Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_ideas_updated_at ON ideas;
CREATE TRIGGER update_ideas_updated_at
    BEFORE UPDATE ON ideas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Insert sample data (optional - remove in production)
-- INSERT INTO ideas (title, description, category, keywords, status) VALUES
-- ('AI-Powered Customer Support', 'An AI chatbot for customer service', 'ai', ARRAY['ai', 'customer-support', 'chatbot'], 'submitted'),
-- ('Pet Health App', 'Mobile app for pet health tracking', 'pet tech', ARRAY['pet', 'health', 'mobile'], 'mvp'),
-- ('Vertical SaaS for Dentists', 'Practice management software for dental clinics', 'vertical saas', ARRAY['saas', 'dentistry', 'healthcare'], 'paying');

COMMENT ON TABLE ideas IS 'Stores user-submitted startup ideas and their metadata';
COMMENT ON COLUMN ideas.keywords IS 'Array of keywords used for clustering similar ideas';
COMMENT ON COLUMN ideas.metadata IS 'Flexible JSONB field for additional idea data';

