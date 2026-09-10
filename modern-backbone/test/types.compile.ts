import {
	type AttributesOf,
	Collection,
	type CollectionEventMap,
	type CollectionInput,
	Model,
	type ModelEventMap,
	View,
} from '../src/index.js';

interface UserAttributes {
	id?: number;
	name: string;
}

interface ProjectAttributes {
	id?: string;
	title: string;
}

class User extends Model<UserAttributes> {}
class Project extends Model<ProjectAttributes> {}
class FakeModel extends EventTarget {
	readonly id = 1;
}

const user = new User({ id: 1, name: 'Ada' });
const project = new Project({ id: 'modern-backbone', title: 'Modern Backbone' });

// @ts-expect-error Models with different attribute schemas are invariant.
const userAsProject: Model<ProjectAttributes> = user;
// @ts-expect-error Model invariance applies in both assignment directions.
const projectAsUser: Model<UserAttributes> = project;

const userAttributes: AttributesOf<User> = { name: 'Grace' };
const userInput: CollectionInput<User> = userAttributes;
const users = new Collection(User, [user, userInput]);
const inferredUser: User | undefined = users.get(1);

users.add({ id: 2, name: 'Katherine' });
user.get('name');
user.set('name', 'Grace');
user.unset('name');

const modelListener = (event: ModelEventMap<UserAttributes, User>['change:name']) => {
	const value: string | undefined = event.detail.value;
	void value;
};
const collectionListener = (event: CollectionEventMap<User>['add']) => {
	const model: User = event.detail.model;
	void model;
};

user.addEventListener('change:name', modelListener);
user.removeEventListener('change:name', modelListener);
user.removeEventListener('change:name', (event) => {
	const value: string | undefined = event.detail.value;
	void value;
});
users.addEventListener('add', collectionListener);
users.removeEventListener('add', collectionListener);
users.removeEventListener('remove', (event) => {
	const model: User = event.detail.model;
	void model;
});

const view = new View({ collection: users, model: user });
view.listen(user, 'change:name', (event) => {
	const value: string | undefined = event.detail.value;
	// @ts-expect-error Model event detail values retain their declared types.
	const invalid: number = event.detail.value;
	void [value, invalid];
});
view.listen(users, 'add', (event) => {
	const model: User = event.detail.model;
	// @ts-expect-error Collection event detail retains the configured model type.
	const invalid: Project = event.detail.model;
	void [model, invalid];
});
view.listen(window, 'popstate', (event) => {
	const state: unknown = event.state;
	void state;
});
view.listen(document, 'visibilitychange', function (event) {
	const visibility: DocumentVisibilityState = this.visibilityState;
	const visibilityEvent: Event = event;
	void [visibility, visibilityEvent];
});

// @ts-expect-error Collection constructors must create the declared model type.
new Collection<User>(Project);
// @ts-expect-error Collections require actual Model instances, not structurally similar EventTargets.
new Collection<FakeModel>(FakeModel);
// @ts-expect-error Collection inputs must use the configured model's attributes.
new Collection<User>(User, [{ id: 2, title: 'Compiler' }]);
// @ts-expect-error Inferred collections reject instances that do not match their constructor.
new Collection(User, [project]);
// @ts-expect-error Inferred collections reject records outside the constructor's schema.
new Collection(User, [{ title: 'Compiler' }]);
// @ts-expect-error Collections reject instances of a different model type.
users.add(project);
// @ts-expect-error Raw records use the configured model's attribute schema.
users.add({ title: 'Compiler' });
// @ts-expect-error Model attributes only expose declared keys.
user.get('title');
// @ts-expect-error Model attribute values retain their declared types.
user.set('name', 42);
// @ts-expect-error Model attributes can only unset declared keys.
user.unset('title');
// @ts-expect-error The configured model constructor is read-only.
users.model = Project;

void [userAsProject, projectAsUser, inferredUser];
