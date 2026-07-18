function initEsportsSlider() {
    const slider = document.getElementById('mainDashboardSlider');
    const indicatorsContainer = document.getElementById('mainDashboardIndicators');
    if (!slider || !indicatorsContainer) return;

    const cards = slider.querySelectorAll('.esports-card');
    
    // Create indicators
    indicatorsContainer.innerHTML = '';
    cards.forEach((_, idx) => {
        const dot = document.createElement('div');
        dot.className = 'esports-indicator' + (idx === 0 ? ' active' : '');
        indicatorsContainer.appendChild(dot);
    });
    const indicators = indicatorsContainer.querySelectorAll('.esports-indicator');

    // Only run intersection observer on mobile layout
    const observer = new IntersectionObserver((entries) => {
        // Find the entry with the highest intersection ratio
        let maxRatio = 0;
        let activeIndex = -1;
        let activeCard = null;

        entries.forEach(entry => {
            if (entry.intersectionRatio > maxRatio) {
                maxRatio = entry.intersectionRatio;
                activeCard = entry.target;
            }
        });

        if (maxRatio > 0.5 && activeCard) { // at least 50% visible
            cards.forEach((card, idx) => {
                if (card === activeCard) {
                    card.classList.add('active-slide');
                    activeIndex = idx;
                } else {
                    card.classList.remove('active-slide');
                }
            });

            if (activeIndex !== -1) {
                indicators.forEach((ind, idx) => {
                    ind.classList.toggle('active', idx === activeIndex);
                    // Update indicator color based on active card
                    if (idx === activeIndex) {
                        ind.style.background = activeCard.style.getPropertyValue('--card-color') || '#fff';
                    } else {
                        ind.style.background = 'rgba(255,255,255,0.2)';
                    }
                });
            }
        }
    }, {
        root: slider,
        threshold: [0.3, 0.5, 0.7, 1.0]
    });

    cards.forEach(card => observer.observe(card));
    
    // Add initial active class to first card if no intersection triggered yet
    if(cards.length > 0) cards[0].classList.add('active-slide');
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initEsportsSlider, 500);
});
