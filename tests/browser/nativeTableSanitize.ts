// Test host substitute for Joplin's DOMPurify wrapper. No external HTML is loaded.
export default (html: string) => {
	const template = document.createElement('template');
	template.innerHTML = html;
	for (const element of Array.from(template.content.querySelectorAll('*'))) {
		if (!['STRONG', 'EM', 'CODE', 'DEL', 'A', 'BR'].includes(element.tagName)) element.replaceWith(element.textContent ?? '');
		for (const attribute of Array.from(element.attributes)) {
			if (attribute.name !== 'href' || /^\s*(javascript|data|vbscript):/i.test(attribute.value)) element.removeAttribute(attribute.name);
		}
	}
	return template.innerHTML;
};
