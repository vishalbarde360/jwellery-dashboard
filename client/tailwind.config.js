/** Design tokens for Aviraj  POS */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // साईडबारसाठी तुमचा आवडता चॉकलेट / डार्क वाईन रंग आणि बेज अक्षरे
        ink: { 
          DEFAULT: '#521B24', // चॉकलेट रंग
          700: '#3D1219',     
          500: '#6B2B35',     
          100: '#FAF6F0'      // बेज (Beige) अक्षरे
        },
        // मुख्य स्क्रीनवरील फॉर्म, कार्ड्स आणि कंटेनर्स पुन्हा लाईट केले आहेत
        paper: { 
          DEFAULT: '#F3F6F6', // लाईट बॅकग्राउंड
          card: '#FFFFFF',    // फॉर्म कंटेनर्स पूर्ण पांढरे दिसतील
          line: '#DDE4E4'     // बार्डर्स
        },
        gold: { DEFAULT: '#B58A2E', soft: '#F3E8CC', deep: '#8A6619' },
        ruby: { DEFAULT: '#A3262F', soft: '#F7DEE0' },
        leaf: { DEFAULT: '#2E7D4F', soft: '#DCF0E3' },
      },
      fontFamily: { sans: ['Manrope', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '10px' },
    },
  },
  plugins: [],
};
