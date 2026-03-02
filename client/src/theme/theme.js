import { createTheme } from '@mui/material/styles';

const glassmorphismStyle = {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
};

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#7e57c2', // Deep purple
            light: '#b085f5',
            dark: '#4d2c91',
        },
        secondary: {
            main: '#00e5ff', // Cyan
            light: '#6effff',
            dark: '#00b2cc',
        },
        background: {
            default: '#0B0F19', // Deep obsidian
            paper: '#131A2A',
        },
        text: {
            primary: '#ffffff',
            secondary: 'rgba(255, 255, 255, 0.7)',
        }
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h1: { fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em' },
        h2: { fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.01em' },
        h3: { fontSize: '1.5rem', fontWeight: 600 },
        h6: { fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.02em' },
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    ...glassmorphismStyle,
                    borderRadius: 16,
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    padding: '8px 24px',
                },
                containedPrimary: {
                    background: 'linear-gradient(45deg, #7e57c2 30%, #b085f5 90%)',
                    boxShadow: '0 3px 15px 2px rgba(126, 87, 194, .3)',
                }
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    ...glassmorphismStyle,
                    borderRadius: 12,
                }
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 8,
                    }
                }
            }
        }
    },
});

export default theme;
