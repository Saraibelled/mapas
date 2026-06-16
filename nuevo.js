(() => {
    const vocCsvUrl = 'https://raw.githubusercontent.com/Saraibelled/mapas/refs/heads/main/bolsas-t.csv';


    const vocZoomConfig = {
        desktop: {
            zoom: 1.40,   
            xOffset: 0,
            yOffset: 0
        },
        mobile: {
            zoom: 2.45,   
            xOffset: 0,
            yOffset: -45  
        }
    };

    let vocAnimationTween = null;
    let stepObserver = null; 

    const vocColorByMeta = {
        'Autoridades y Cargos Públicos': '#C90022',
        'Beneficiarios Finales': '#135AE1',
        'Empresas Instrumentales': '#058896',
        'Gestores de la Trama': '#2197FF',
        'Intermediarios y Testaferros': '#9852D9',
        'Origen de los fondos': '#F6821F',
        'Otros': '#6B6B6B'
    };

    const vocNormalize = (value) => String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const vocParseDelimited = (text, delimiter) => {
        const rows = [];
        let row = [];
        let field = '';
        let insideQuotes = false;

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const nextChar = text[index + 1];

            if (char === '"' && insideQuotes && nextChar === '"') {
                field += '"';
                index += 1;
                continue;
            }

            if (char === '"') {
                insideQuotes = !insideQuotes;
                continue;
            }

            if (char === delimiter && !insideQuotes) {
                row.push(field);
                field = '';
                continue;
            }

            if ((char === '\n' || char === '\r') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    index += 1;
                }

                row.push(field);

                if (row.some((cell) => String(cell).trim() !== '')) {
                    rows.push(row);
                }

                row = [];
                field = '';
                continue;
            }

            field += char;
        }

        if (field || row.length) {
            row.push(field);

            if (row.some((cell) => String(cell).trim() !== '')) {
                rows.push(row);
            }
        }

        return rows;
    };

    const vocGetDelimiter = (text) => {
        const firstLine = String(text || '').split(/\r?\n/)[0] || '';
        const tabs = (firstLine.match(/\t/g) || []).length;
        const commas = (firstLine.match(/,/g) || []).length;

        return tabs >= commas ? '\t' : ',';
    };

    const vocGetNodeData = async () => {
        const response = await fetch(vocCsvUrl);
        const text = await response.text();
        const delimiter = vocGetDelimiter(text);
        const rows = vocParseDelimited(text, delimiter);

        rows.shift();

        const nodeDataBySvgId = new Map();

        rows.forEach((row) => {
            const nodeNumRaw = String(row[1] || '').trim();
            const nodeName = String(row[2] || '').trim();

            if (!nodeNumRaw || !nodeName) {
                return;
            }

            const nodeNum = nodeNumRaw.replace(/^node-/, '');

            const nodeData = {
                id: String(row[0] || '').trim(),
                nodeNum,
                node: nodeName,
                localImage: String(row[3] || '').trim(),
                remoteImage: String(row[4] || '').trim(),
                title: String(row[5] || row[2] || '').trim(),
                text: String(row[6] || '').trim(),
                meta: String(row[9] || row[8] || '').trim()
            };

            nodeDataBySvgId.set(nodeNumRaw, nodeData);
            nodeDataBySvgId.set(nodeNum, nodeData);
            nodeDataBySvgId.set(`node-${nodeNum}`, nodeData);
        });

        return nodeDataBySvgId;
    };

    const vocCreateTooltip = (container) => {
        let tooltip = container.querySelector('.voc-node-tooltip');

        if (tooltip) {
            tooltip.setAttribute('role', 'dialog');
            tooltip.setAttribute('aria-live', 'polite');
            tooltip.setAttribute('aria-hidden', 'true');
            return tooltip;
        }

        tooltip = document.createElement('div');
        tooltip.className = 'voc-node-tooltip';
        tooltip.setAttribute('role', 'dialog');
        tooltip.setAttribute('aria-live', 'polite');
        tooltip.setAttribute('aria-hidden', 'true');

        tooltip.innerHTML = `
            <button class="voc-node-tooltip__close" type="button" aria-label="Cerrar ficha">×</button>
            <div class="voc-node-tooltip__media" aria-hidden="true">
                <img class="voc-node-tooltip__image" alt="">
            </div>
            <h3 class="voc-node-tooltip__title"></h3>
            <p class="voc-node-tooltip__group"></p>
            <p class="voc-node-tooltip__text"></p>
            <p class="voc-node-tooltip__meta"></p>
        `;

        container.appendChild(tooltip);
        return tooltip;
    };

    const vocCreateFixedLabel = (container) => {
        let label = container.querySelector('.voc-node-fixed-label');

        if (label) {
            label.hidden = true;
            label.setAttribute('aria-hidden', 'true');
            return label;
        }

        label = document.createElement('div');
        label.className = 'voc-node-fixed-label';
        label.hidden = true;
        label.setAttribute('aria-hidden', 'true');

        container.appendChild(label);
        return label;
    };

    const vocApplyNodeData = (graphic, nodeDataBySvgId) => {
            graphic.querySelectorAll('.voc-node-image').forEach(img => {
        img.removeAttribute('clip-path');
    });
        const svgNodes = graphic.querySelectorAll('.voc-node-item');

        svgNodes.forEach((svgNode) => {
            const svgId = svgNode.id;
            const cleanId = svgId.replace(/^node-/, '');
            const nodeData = nodeDataBySvgId.get(svgId) || nodeDataBySvgId.get(cleanId);

            if (!nodeData) {
                return;
            }

            const image = nodeData.remoteImage || nodeData.localImage;
            const nodeColor = vocColorByMeta[nodeData.meta];
            const svgCircle = svgNode.querySelector('.voc-node-circle');
            const svgImage = svgNode.querySelector('.voc-node-image');

            svgNode.dataset.vocId = nodeData.id;
            svgNode.dataset.vocNode = nodeData.node;
            svgNode.dataset.vocTitle = nodeData.title;
            svgNode.dataset.vocText = nodeData.text;
            svgNode.dataset.vocMeta = nodeData.meta;
            svgNode.dataset.vocImage = image;

            if (svgCircle && nodeColor) {
                svgCircle.style.fill = nodeColor;
            }

            svgNode.setAttribute('aria-label', `${nodeData.title}. ${nodeData.meta}`);

           if (svgImage) {
    svgImage.setAttribute('width', '14');
    svgImage.setAttribute('height', '14');
    svgImage.setAttribute('x', '-7');
    svgImage.setAttribute('y', '-7');

    if (image) {
        svgImage.setAttribute('href', image);
        svgImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', image);
    }
}
        });
    };

    const vocGetLinkNames = (link) => {
        const raw = String(link.dataset.id || '').replace(/^link-line-/, '');
        const parts = raw.split('--');

        return {
            source: String(parts[0] || '').trim(),
            target: String(parts[1] || '').trim()
        };
    };

    const vocBuildRelations = (graphic) => {
        const links = Array.from(graphic.querySelectorAll('.voc-link-item'));
        const nodes = Array.from(graphic.querySelectorAll('.voc-node-item'));
        const nodeByName = new Map();
        const relationsByNodeName = new Map();

        nodes.forEach((node) => {
            const name = node.dataset.vocNode || node.getAttribute('aria-label') || '';
            const key = vocNormalize(name);

            nodeByName.set(key, node);
            relationsByNodeName.set(key, {
                links: [],
                related: new Set()
            });
        });

        links.forEach((link) => {
            const names = vocGetLinkNames(link);
            const sourceKey = vocNormalize(names.source);
            const targetKey = vocNormalize(names.target);

            if (!relationsByNodeName.has(sourceKey)) {
                relationsByNodeName.set(sourceKey, { links: [], related: new Set() });
            }
            if (!relationsByNodeName.has(targetKey)) {
                relationsByNodeName.set(targetKey, { links: [], related: new Set() });
            }

            relationsByNodeName.get(sourceKey).links.push(link);
            relationsByNodeName.get(sourceKey).related.add(targetKey);
            relationsByNodeName.get(targetKey).links.push(link);
            relationsByNodeName.get(targetKey).related.add(sourceKey);
        });

        return { links, nodes, nodeByName, relationsByNodeName };
    };

    const vocGetSvgBaseViewBox = (graphic) => {
        if (!graphic.dataset.vocBaseViewBox) {
            if (!graphic.getAttribute('viewBox')) {
                const width = Number(graphic.getAttribute('width')) || 1195;
                const height = Number(graphic.getAttribute('height')) || 1195;
                graphic.setAttribute('viewBox', `0 0 ${width} ${height}`);
            }
            graphic.dataset.vocBaseViewBox = graphic.getAttribute('viewBox');
        }

        const values = graphic.dataset.vocBaseViewBox.split(/\s+/).map(Number);
        return {
            x: values[0] || 0,
            y: values[1] || 0,
            width: values[2] || 1195,
            height: values[3] || 1195
        };
    };

    const vocGetNodePoint = (node) => {
        const transform = node.getAttribute('transform') || '';
        const match = transform.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);

        return {
            x: match ? Number(match[1]) : 0,
            y: match ? Number(match[2]) : 0
        };
    };

    const vocGetZoomSettings = (step) => {
        const isMobile = window.matchMedia('(max-width: 699px)').matches;
        const base = isMobile ? vocZoomConfig.mobile : vocZoomConfig.desktop;

        const rawZoom = isMobile ? step?.dataset.zoomMovil : step?.dataset.zoomDesktop;
        const zoomFromHtml = Number(rawZoom);

        return {
            zoom: Number.isFinite(zoomFromHtml) && zoomFromHtml > 0 ? zoomFromHtml : base.zoom,
            xOffset: base.xOffset,
            yOffset: base.yOffset
        };
    };


    const vocZoomToNode = (graphic, node, step) => {
        const base = vocGetSvgBaseViewBox(graphic);
        const point = vocGetNodePoint(node);
        const settings = vocGetZoomSettings(step);
        
        const zoom = Math.max(1, settings.zoom);
        const width = base.width / zoom;
        const height = base.height / zoom;
        
        const minX = base.x;
        const minY = base.y;
        const maxX = base.x + base.width - width;
        const maxY = base.y + base.height - height;
        
        const targetX = Math.min(Math.max(point.x - width / 2 + settings.xOffset, minX), maxX);
        const targetY = Math.min(Math.max(point.y - height / 2 + settings.yOffset, minY), maxY);

        if (vocAnimationTween) cancelAnimationFrame(vocAnimationTween);

        const currentViewBox = graphic.getAttribute('viewBox').split(/\s+/).map(Number);
        let curX = currentViewBox[0];
        let curY = currentViewBox[1];
        let curW = currentViewBox[2];
        let curH = currentViewBox[3];

        const easeFactor = 0.08; 

        const animateCamera = () => {
            curX += (targetX - curX) * easeFactor;
            curY += (targetY - curY) * easeFactor;
            curW += (width - curW) * easeFactor;
            curH += (height - curH) * easeFactor;

            graphic.setAttribute('viewBox', `${curX} ${curY} ${curW} ${curH}`);

            if (Math.abs(targetX - curX) > 0.1 || Math.abs(width - curW) > 0.1) {
                vocAnimationTween = requestAnimationFrame(animateCamera);
            }
        };

        vocAnimationTween = requestAnimationFrame(animateCamera);
    };

    const vocSetTooltipContent = (tooltip, node) => {
        const image = tooltip.querySelector('.voc-node-tooltip__image');
        const media = tooltip.querySelector('.voc-node-tooltip__media');
        const title = tooltip.querySelector('.voc-node-tooltip__title');
        const group = tooltip.querySelector('.voc-node-tooltip__group');
        const text = tooltip.querySelector('.voc-node-tooltip__text');
        const meta = tooltip.querySelector('.voc-node-tooltip__meta');

        title.textContent = node.dataset.vocTitle || node.dataset.vocNode || '';
        group.textContent = node.dataset.vocMeta || '';
        text.textContent = node.dataset.vocText || '';
        meta.textContent = node.dataset.vocNode || '';

        if (node.dataset.vocImage) {
            image.src = node.dataset.vocImage;
            image.alt = '';
            media.hidden = false;
        } else {
            image.removeAttribute('src');
            media.hidden = true;
        }
    };

    const vocPositionTooltip = (tooltip, node, container) => {
        const containerRect = container.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = nodeRect.left - containerRect.left + nodeRect.width / 2 + 18;
        const top = nodeRect.top - containerRect.top + nodeRect.height / 2 + 18;
        const maxLeft = Math.max(12, containerRect.width - tooltipRect.width - 12);
        const maxTop = Math.max(12, containerRect.height - tooltipRect.height - 12);

        tooltip.style.left = `${Math.min(Math.max(12, left), maxLeft)}px`;
        tooltip.style.top = `${Math.min(Math.max(12, top), maxTop)}px`;
    };

    const vocPositionFixedLabel = (label, node, container) => {
        if (!node || label.hidden) {
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const left = nodeRect.left - containerRect.left + nodeRect.width / 2;
        const top = nodeRect.top - containerRect.top;

        label.style.left = `${left}px`;
        label.style.top = `${top}px`;
    };

    const vocShowFixedLabel = ({ label, node, container }) => {
        if (!node) {
            label.hidden = true;
            label.textContent = '';
            return;
        }

        label.textContent = node.dataset.vocTitle || node.dataset.vocNode || node.getAttribute('aria-label') || '';
        label.hidden = false;

        requestAnimationFrame(() => {
            vocPositionFixedLabel(label, node, container);
        });
    };

    const vocHideFixedLabel = (label) => {
        label.hidden = true;
        label.textContent = '';
    };

    const vocClearState = (nodes, links) => {
        nodes.forEach((node) => {
            node.classList.remove('voc-is-story-active', 'voc-is-story-related', 'voc-is-story-muted', 'voc-has-tooltip-open');
        });

        links.forEach((link) => {
            link.classList.remove('voc-is-story-active', 'voc-is-story-muted');
        });
    };

    const vocHighlightNodeRelations = ({ node, nodes, links, nodeByName, relationsByNodeName }) => {
        const nodeKey = vocNormalize(node.dataset.vocNode || node.getAttribute('aria-label'));
        const relation = relationsByNodeName.get(nodeKey);

        vocClearState(nodes, links);
        node.classList.add('voc-is-story-active');

        nodes.forEach((item) => {
            if (item !== node) item.classList.add('voc-is-story-muted');
        });

        links.forEach((link) => {
            link.classList.add('voc-is-story-muted');
        });

        if (!relation) return;

        relation.links.forEach((link) => {
            link.classList.add('voc-is-story-active');
            link.classList.remove('voc-is-story-muted');
        });

        relation.related.forEach((relatedKey) => {
            const relatedNode = nodeByName.get(relatedKey);
            if (relatedNode) {
                relatedNode.classList.add('voc-is-story-related');
                relatedNode.classList.remove('voc-is-story-muted');
            }
        });
    };

    const vocActivateNode = ({ graphic, node, step, tooltip, container, fixedLabel, labelNode, nodes, links, nodeByName, relationsByNodeName, showTooltip }) => {
        const nodeKey = vocNormalize(node.dataset.vocNode || node.getAttribute('aria-label'));
        const relation = relationsByNodeName.get(nodeKey);

        vocClearState(nodes, links);
        vocZoomToNode(graphic, node, step);

        if (labelNode) {
            vocShowFixedLabel({ label: fixedLabel, node: labelNode, container });
        } else {
            vocHideFixedLabel(fixedLabel);
        }

        node.classList.add('voc-is-story-active');
        if (showTooltip) node.classList.add('voc-has-tooltip-open');

        nodes.forEach((item) => {
            if (item !== node) item.classList.add('voc-is-story-muted');
        });

        links.forEach((link) => {
            link.classList.add('voc-is-story-muted');
        });

        if (relation) {
            relation.links.forEach((link) => {
                link.classList.add('voc-is-story-active');
                link.classList.remove('voc-is-story-muted');
            });

            relation.related.forEach((relatedKey) => {
                const relatedNode = nodeByName.get(relatedKey);
                if (relatedNode) {
                    relatedNode.classList.add('voc-is-story-related');
                    relatedNode.classList.remove('voc-is-story-muted');
                }
            });
        }

        if (showTooltip) {
            vocSetTooltipContent(tooltip, node);
            tooltip.classList.add('voc-is-visible');
            tooltip.setAttribute('aria-hidden', 'false');
            vocPositionTooltip(tooltip, node, container);
        } else {
            tooltip.classList.remove('voc-is-visible');
            tooltip.setAttribute('aria-hidden', 'true');
        }
    };

    const vocCloseTooltip = ({ tooltip, nodes }) => {
        tooltip.classList.remove('voc-is-visible');
        tooltip.setAttribute('aria-hidden', 'true');
        nodes.forEach((node) => {
            node.classList.remove('voc-has-tooltip-open');
        });
    };

    const vocCreateProgressDots = (steps) => {
        const progress = document.getElementById('voc-scroll-progress');
        if (!progress) return [];
        progress.innerHTML = '';

        return steps.map((step, index) => {
            const dot = document.createElement('span');
            dot.className = 'voc-scroll__progress-dot';
            dot.setAttribute('aria-hidden', 'true');
            if (index === 0) dot.classList.add('voc-is-active');
            progress.appendChild(dot);
            return dot;
        });
    };

    const vocSetActiveStep = (steps, dots, activeIndex) => {
        steps.forEach((step, index) => {
            step.classList.toggle('voc-is-active', index === activeIndex);
        });
        dots.forEach((dot, index) => {
            dot.classList.toggle('voc-is-active', index === activeIndex);
        });
    };

    const vocBindInteractions = ({ graphic, container, tooltip, fixedLabel, nodes, links, nodeByName, relationsByNodeName }) => {
        let activeNode = null;
        let activeNodeStep = null;
        let activeStepIndex = -1;
        let isFreeMode = false;

        const nodeById = new Map();
        const steps = Array.from(document.querySelectorAll('.voc-scroll__step'));
        const dots = vocCreateProgressDots(steps);

        nodes.forEach((node) => {
            nodeById.set(node.id, node);
        });

        const getLabelNodeFromStep = (step) => {
            if (!step?.dataset.labelNode) return null;
            return nodeById.get(step.dataset.labelNode) || null;
        };

        const activate = ({ node, step = null, showTooltip = false }) => {
            const labelNode = showTooltip ? null : getLabelNodeFromStep(step);
            activeNode = node;
            activeNodeStep = step;

            vocActivateNode({
                graphic, node, step, tooltip, container, fixedLabel, labelNode,
                nodes, links, nodeByName, relationsByNodeName, showTooltip
            });
        };

        const restoreActiveState = () => {
            if (tooltip.classList.contains('voc-is-visible') && activeNode) {
                activate({ node: activeNode, step: activeNodeStep, showTooltip: true });
                return;
            }

            const activeStep = steps[activeStepIndex] || null;
            const stepNode = activeStep?.dataset.vocFocus ? nodeById.get(activeStep.dataset.vocFocus) : null;

            if (stepNode) {
                activate({ node: stepNode, step: activeStep, showTooltip: false });
                return;
            }

            vocClearState(nodes, links);
        };

        nodes.forEach((node) => {
            node.addEventListener('mouseenter', () => {
                if (!isFreeMode) return;
                vocHighlightNodeRelations({ node, nodes, links, nodeByName, relationsByNodeName });
            });

            node.addEventListener('mouseleave', () => { 
                if (!isFreeMode) return;
                restoreActiveState(); 
            });
        
            
            node.addEventListener('click', (event) => {
                if (!isFreeMode) return;
                event.stopPropagation();
                activate({ node, step: null, showTooltip: true });
            });

            node.addEventListener('keydown', (event) => {
                if (!isFreeMode) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate({ node, step: null, showTooltip: true });
            });
        });

        const setupObserver = () => {

    stepObserver = new IntersectionObserver((entries) => {
        if (isFreeMode) return;


        const viewportMid = window.innerHeight / 2;

        let closestStep = null;
        let closestDist = Infinity;

        steps.forEach((step) => {
            const rect = step.getBoundingClientRect();

            if (rect.bottom < 0 || rect.top > window.innerHeight) return;

            const stepMid = rect.top + rect.height / 2;
            const dist = Math.abs(stepMid - viewportMid);

            if (dist < closestDist) {
                closestDist = dist;
                closestStep = step;
            }
        });

        if (!closestStep) return;

        const stepIndex = steps.indexOf(closestStep);
        if (stepIndex === activeStepIndex) return;

const nodeId = closestStep.dataset.vocFocus;
const node = nodeId ? nodeById.get(nodeId) : null;

activeStepIndex = stepIndex;
vocSetActiveStep(steps, dots, stepIndex);

if (!node) {
    // Step de vista general: limpia highlights y resetea zoom al viewBox original
    vocClearState(nodes, links);
    vocHideFixedLabel(fixedLabel);
    tooltip.classList.remove('voc-is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
    activeNode = null;
    activeNodeStep = null;

    const base = vocGetSvgBaseViewBox(graphic);
    if (vocAnimationTween) cancelAnimationFrame(vocAnimationTween);

    const currentViewBox = graphic.getAttribute('viewBox').split(/\s+/).map(Number);
    let curX = currentViewBox[0];
    let curY = currentViewBox[1];
    let curW = currentViewBox[2];
    let curH = currentViewBox[3];

    const animateReset = () => {
        curX += (base.x - curX) * 0.08;
        curY += (base.y - curY) * 0.08;
        curW += (base.width - curW) * 0.08;
        curH += (base.height - curH) * 0.08;
        graphic.setAttribute('viewBox', `${curX} ${curY} ${curW} ${curH}`);
        if (Math.abs(base.width - curW) > 0.1) {
            vocAnimationTween = requestAnimationFrame(animateReset);
        }
    };
    vocAnimationTween = requestAnimationFrame(animateReset);
    return;
}

activate({ node, step: closestStep, showTooltip: false });

    }, {
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0]
    });

    steps.forEach((step) => {
        stepObserver.observe(step);
        step.addEventListener('focus', () => {
            if (isFreeMode) return;
            const node = nodeById.get(step.dataset.vocFocus);
            if (!node) return;
            const stepIndex = steps.indexOf(step);
            activeStepIndex = stepIndex;
            vocSetActiveStep(steps, dots, stepIndex);
            activate({ node, step, showTooltip: false });
        });
    });
};

        if (steps.length) {
            setupObserver();
        }


        const freeModeBtn = document.getElementById('voc-btn-free-mode');
        const mainContainer = document.getElementById('voc-scroll');

        if (freeModeBtn && mainContainer) {
            freeModeBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                isFreeMode = !isFreeMode;

                if (isFreeMode) {
                    mainContainer.classList.add('voc-is-free-mode');
                    freeModeBtn.textContent = 'Volver a la historia';
                    freeModeBtn.style.background = '#202020';
                    

                    if (stepObserver) {
                        steps.forEach(step => stepObserver.unobserve(step));
                    }
                } else {
                    mainContainer.classList.remove('voc-is-free-mode');
                    freeModeBtn.textContent = 'Explorar grafo libremente';
                    freeModeBtn.style.background = '';
                    
                    vocCloseTooltip({ tooltip, nodes });
                    

                    if (stepObserver) {
                        steps.forEach(step => stepObserver.observe(step));
                    }
                    restoreActiveState();
                }
            });
        }

        const closeButton = tooltip.querySelector('.voc-node-tooltip__close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                vocCloseTooltip({ tooltip, nodes });
                restoreActiveState();
            });
        }

        document.addEventListener('click', (event) => {
            if (!tooltip.classList.contains('voc-is-visible')) return;
            if (tooltip.contains(event.target) || event.target.closest('.voc-node-item')) return;
            vocCloseTooltip({ tooltip, nodes });
            restoreActiveState();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (!tooltip.classList.contains('voc-is-visible')) return;
            vocCloseTooltip({ tooltip, nodes });
            restoreActiveState();
        });

        window.addEventListener('resize', () => {
            if (!activeNode) return;
            const labelNode = tooltip.classList.contains('voc-is-visible') ? null : getLabelNodeFromStep(activeNodeStep);

            vocZoomToNode(graphic, activeNode, activeNodeStep);

            if (labelNode) {
                vocShowFixedLabel({ label: fixedLabel, node: labelNode, container });
            } else {
                vocHideFixedLabel(fixedLabel);
            }

            if (tooltip.classList.contains('voc-is-visible')) {
                vocPositionTooltip(tooltip, activeNode, container);
            }
        }, { passive: true });

        window.addEventListener('scroll', () => {
            const labelNode = tooltip.classList.contains('voc-is-visible') ? null : getLabelNodeFromStep(activeNodeStep);

            if (labelNode) vocPositionFixedLabel(fixedLabel, labelNode, container);
            if (activeNode && tooltip.classList.contains('voc-is-visible')) {
                vocPositionTooltip(tooltip, activeNode, container);
            }
        }, { passive: true });

        graphic.dataset.vocReady = 'true';
    };

    const vocInit = async () => {
        const graphic = document.getElementById('graphic');
        if (!graphic || graphic.dataset.vocReady === 'true') return;

        const container = graphic.closest('.voc-scroll__graphic-wrap') || graphic.parentElement;
        if (!container) return;

        try {
            const tooltip = vocCreateTooltip(container);
            const fixedLabel = vocCreateFixedLabel(container);
            const nodeDataBySvgId = await vocGetNodeData();

            vocGetSvgBaseViewBox(graphic);
            vocApplyNodeData(graphic, nodeDataBySvgId);

            const relations = vocBuildRelations(graphic);

            vocBindInteractions({
                graphic, container, tooltip, fixedLabel,
                nodes: relations.nodes,
                links: relations.links,
                nodeByName: relations.nodeByName,
                relationsByNodeName: relations.relationsByNodeName
            });
        } catch (error) {
            console.warn('No se pudo inicializar el gráfico.', error);
        }
    };

    if (document.getElementById('graphic')) {
        vocInit();
    } else {
        document.addEventListener('DOMContentLoaded', vocInit, { once: true });
    }
})();
