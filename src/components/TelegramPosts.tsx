import {useState} from 'react';
import {API_CONFIG} from '../config/api';
import {useToast} from './Toast';

export default function TelegramPosts() {
    const {showError, showSuccess} = useToast();
    const [loading, setLoading] = useState(false);
    const [generatedContent, setGeneratedContent] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    const generatePinnedPost = async () => {
        setLoading(true);
        setGeneratedContent(null);

        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/generate-pinned-post`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                setGeneratedContent(result.content);
                showSuccess('Telegram post generated successfully!');
            } else {
                showError('Failed to generate Telegram post');
            }
        } catch (err) {
            console.error('Error generating Telegram post:', err);
            showError('Error generating Telegram post');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async () => {
        if (!generatedContent) return;

        try {
            await navigator.clipboard.writeText(generatedContent);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            showError('Failed to copy to clipboard');
        }
    };

    return (
        <div className="telegram-posts">
            <div className="telegram-posts-header">
                <h3>Telegram Posts</h3>
                <p>Generate templated update posts for Telegram channel</p>
            </div>

            <div className="telegram-posts-content">
                <div className="generate-section">
                    <h4>Generate Pinned Post</h4>
                    <p>Create a templated update post for subscribers to check their balances.</p>
                    
                    <button 
                        onClick={generatePinnedPost}
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? 'Generating...' : '📝 Generate Pinned Post'}
                    </button>
                </div>

                {generatedContent && (
                    <div className="content-section">
                        <h4>Generated Content</h4>
                        <div className="content-display">
                            <pre>{generatedContent}</pre>
                        </div>
                        <div className="content-actions">
                            <button 
                                onClick={copyToClipboard}
                                className="btn btn-success"
                            >
                                {copySuccess ? '✅ Copied!' : '📋 Copy to Clipboard'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
