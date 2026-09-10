import assert from 'node:assert/strict';
import test from 'node:test';
import Backbone from 'backbone';

interface DocumentAttributes extends Backbone.ObjectHash {
	id: string;
	length: number;
	name: string;
	surname: string;
	title: string;
}

class Document extends Backbone.Model<DocumentAttributes> {
	fullName(): string {
		return `${this.get('name')} ${this.get('surname')}`;
	}
}

class ProperDocument extends Document {
	override fullName(): string {
		return `Mr. ${super.fullName()}`;
	}
}

test('Backbone.Model supports inherited model methods', () => {
	const tempest = new Document({
		id: '1-the-tempest',
		length: 123,
		name: 'William',
		surname: 'Shakespeare',
		title: 'The Tempest',
	});
	const properTempest = new ProperDocument(tempest.attributes as DocumentAttributes);

	assert.equal(tempest.fullName(), 'William Shakespeare');
	assert.equal(tempest.get('length'), 123);
	assert.equal(properTempest.fullName(), 'Mr. William Shakespeare');
	assert.equal(properTempest.get('length'), 123);
});
